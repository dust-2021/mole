#include "src/wireguard.h"
#include "wireguard_tool.cpp"
#include "src/windivert.h"
#include "shared_mutex"
#include "thread"
#include "unordered_set"
#include "atomic"

#pragma comment(lib, "lib/src/WinDivert.lib")

// 隧道组播封装标记头：附加在 UDP payload 最前面，固定 8 字节
#pragma pack(push, 1)
struct multicast_marker
{
    uint32_t magic;          // 魔数 0x4D434D54 "MCMT"，接收端据此识别
    uint32_t orig_dst_addr;  // 原始组播/广播目标地址（网络字节序）
};
#pragma pack(pop)

// 识别魔数
static constexpr uint32_t MULTICAST_MARKER_MAGIC = 0x4D434D54;
// 封装长度阈值：小于该长度才封装/还原，防止封装后超过 wireguard MTU
static constexpr uint16_t MULTICAST_ENCAP_LIMIT = 1400;

// 用于转发三层网络中的广播数据包到wireguard隧道
class transporter
{
public:
    // 组播数据包过滤器，匹配所有的组播数据包
    static const char *multicast_filter;
    static transporter bt_instance;

    transporter(const transporter &b) = delete;
    transporter &operator=(const transporter &) = delete;

    static transporter &getInstance()
    {
        return bt_instance;
    }

    void add_ips(const char **ips, size_t count)
    {
        std::unique_lock<std::shared_mutex> lock(peer_rw_lock);
        for (size_t i = 0; i < count; i++)
        {
            if (inet_addr(ips[i]) == INADDR_NONE)
                continue;
            peers.insert(inet_addr(ips[i]));
            log(WIREGUARD_LOG_INFO, std::string("add broadcast peer ip:") + ips[i]);
        }
    }

    void del_ips(const char **ips, size_t count)
    {
        std::unique_lock<std::shared_mutex> lock(peer_rw_lock);
        for (size_t i = 0; i < count; i++)
        {
            peers.erase(inet_addr(ips[i]));
            log(WIREGUARD_LOG_INFO, std::string("del broadcast peer ip:") + ips[i]);
        }
    }

    void stop_trans()
    {
        stop = true;
        // 关闭发送端接收通道，让阻塞中的 WinDivertRecv 立即返回 ERROR_OPERATION_ABORTED，
        // 接收线程随后自行退出并关闭句柄，避免跨线程关闭句柄产生竞争
        HANDLE h = windivert_handle.load(std::memory_order_acquire);
        if (h != NULL && h != INVALID_HANDLE_VALUE)
        {
            WinDivertShutdown(h, WINDIVERT_SHUTDOWN_RECV);
        }
        // 关闭接收端嗅探通道，让解析线程退出
        HANDLE rx = rx_handle.load(std::memory_order_acquire);
        if (rx != NULL && rx != INVALID_HANDLE_VALUE)
        {
            WinDivertShutdown(rx, WINDIVERT_SHUTDOWN_RECV);
        }
    }

    void run(DWORD wg_idx)
    {   
        // 广播转发线程，复制所有广播到每个peer，组播数据包进行再封装
        braoder_thread = std::thread([this, wg_idx]{
            auto filter = multicast_filter + std::to_string(wg_idx);
            log(WIREGUARD_LOG_INFO, "broadcast run with filter: " + filter);
            // 获取windivert句柄，设置为嗅探模式，接收出站广播/组播
            HANDLE h = WinDivertOpen(filter.c_str(), WINDIVERT_LAYER_NETWORK, 0, WINDIVERT_FLAG_SNIFF);
            windivert_handle.store(h, std::memory_order_release);
            if (h == INVALID_HANDLE_VALUE || h == NULL)
            {
                log(WIREGUARD_LOG_ERR, "load windivert failed", GetLastError());
                return;
            }

            WINDIVERT_ADDRESS addr;
            char packet[0xffff];
            uint32_t packet_l;
            log(WIREGUARD_LOG_INFO, "start layer 3 broadcast transport");
            while (!stop)
            {
                if (!WinDivertRecv(h, packet, sizeof(packet), &packet_l, &addr))
                {
                    auto error = GetLastError();
                    if (error == ERROR_TIMEOUT || error == ERROR_HOST_UNREACHABLE)
                    {
                        if (stop) break;
                        continue;
                    }

                    if (error == ERROR_INVALID_HANDLE || error == ERROR_OPERATION_ABORTED)
                    {
                        break;
                    }
                    log(WIREGUARD_LOG_ERR, "windivert read failed", error);
                    break;
                }
                PWINDIVERT_IPHDR ip_header = NULL;
                PWINDIVERT_IPV6HDR ipv6_header = NULL;
                PWINDIVERT_UDPHDR udp_header = NULL;

                // 解析数据包
                WinDivertHelperParsePacket(
                    packet, packet_l,
                    &ip_header, &ipv6_header,
                    NULL, NULL, NULL, NULL,
                    &udp_header, NULL, NULL, NULL, NULL
                );
                if (ip_header == NULL)
                {
                    log(WIREGUARD_LOG_ERR, "parse broadcast data failed");
                    continue;
                }

                // 组播判断（DstAddr 为网络字节序）：224.0.0.0/4 为组播，255.255.255.255 为受限广播。
                // WireGuard 不支持组播路由，所以两者统一走"广播/组播转单播泛洪"：
                // 复制包并把 DstAddr 改写为每个 peer 的 IP 后发送。
                bool is_multicast = (ip_header->DstAddr & htonl(0xF0000000)) == htonl(0xE0000000);

                // 链路本地组播 224.0.0.0/24（mDNS 224.0.0.251、LLMNR 224.0.0.252、IGMP 查询等）
                // 属于单跳协议，跨隧道泛洪无意义且可能干扰对端网络，直接跳过
                if (is_multicast && (ntohl(ip_header->DstAddr) & 0xFFFFFF00) == 0xE0000000)
                {
                    continue;
                }
                
                // 收发端约定小于一定长度才进行封装/解封装，防止封装后超过 wireguard MTU。
                // 封装：在 UDP payload 前插入 8 字节标记头，携带原始组播/广播地址供接收端还原。
                // 只对 UDP 广播/组播封装，其它协议（TCP/ICMP 等）照常单播泛洪但不打标。
                if (packet_l < MULTICAST_ENCAP_LIMIT && udp_header != NULL)
                {
                    uint32_t orig_dst = ip_header->DstAddr; // 原始组播/广播地址
                    BYTE *payload = (BYTE *)udp_header + sizeof(WINDIVERT_UDPHDR);
                    uint16_t udp_len = ntohs(udp_header->Length);
                    uint16_t payload_len = udp_len - (uint16_t)sizeof(WINDIVERT_UDPHDR);

                    // payload 后移 8 字节并写入标记头
                    memmove(payload + sizeof(multicast_marker), payload, payload_len);
                    auto *m = (multicast_marker *)payload;
                    m->magic = htonl(MULTICAST_MARKER_MAGIC);
                    m->orig_dst_addr = orig_dst;

                    // 同步更新 UDP/IP 长度与总包长
                    udp_header->Length = htons(udp_len + (uint16_t)sizeof(multicast_marker));
                    ip_header->Length = htons(ntohs(ip_header->Length) + (uint16_t)sizeof(multicast_marker));
                    packet_l += (uint32_t)sizeof(multicast_marker);
                }

                std::shared_lock<std::shared_mutex> lock(peer_rw_lock);
                if (peers.empty()) continue;
                for (const auto &p : peers)
                {
                    // 如果目标地址已经是peer的ip地址，则不转发
                    if (p == ip_header->DstAddr) continue;
                    ip_header->DstAddr = p;
                    if (!WinDivertHelperCalcChecksums(packet, packet_l, &addr, 0)) continue;
                    if (!WinDivertSend(h, packet, packet_l, nullptr, &addr))
                    {
                        log(WIREGUARD_LOG_ERR, "windivert send failed", GetLastError());
                    }
                }
                lock.unlock();
            }
            // 接收线程自行关闭句柄，避免与 stop_trans 跨线程关闭产生竞争
            WinDivertClose(h);
            windivert_handle.store(NULL, std::memory_order_release);
            log(WIREGUARD_LOG_INFO, "stop layer 3 broadcast transport with filter:" + filter);
        });
        parser_thread = std::thread([this, wg_idx]{
            // 接收端：嗅探从 wireguard 网卡进入的 UDP 包，识别隧道组播并还原
            auto rx_filter = "inbound and ifIdx == " + std::to_string(wg_idx) + " and udp";
            log(WIREGUARD_LOG_INFO, "parser run with filter: " + rx_filter);
            HANDLE rx = WinDivertOpen(rx_filter.c_str(), WINDIVERT_LAYER_NETWORK, 0, WINDIVERT_FLAG_SNIFF);
            rx_handle.store(rx, std::memory_order_release);
            if (rx == INVALID_HANDLE_VALUE || rx == NULL)
            {
                log(WIREGUARD_LOG_ERR, "parser windivert open failed", GetLastError());
                return;
            }
            // 注入句柄（非嗅探模式），用于把还原后的组播包送回本机协议栈
            HANDLE inject = WinDivertOpen("true", WINDIVERT_LAYER_NETWORK, 0, 0);
            inject_handle.store(inject, std::memory_order_release);
            if (inject == INVALID_HANDLE_VALUE || inject == NULL)
            {
                log(WIREGUARD_LOG_ERR, "parser inject open failed", GetLastError());
                WinDivertClose(rx);
                rx_handle.store(NULL, std::memory_order_release);
                return;
            }

            WINDIVERT_ADDRESS addr;
            char packet[0xffff];
            uint32_t packet_l;
            while (!stop)
            {
                if (!WinDivertRecv(rx, packet, sizeof(packet), &packet_l, &addr))
                {
                    auto error = GetLastError();
                    if (error == ERROR_TIMEOUT || error == ERROR_HOST_UNREACHABLE)
                    {
                        if (stop) break;
                        continue;
                    }
                    if (error == ERROR_INVALID_HANDLE || error == ERROR_OPERATION_ABORTED)
                    {
                        break;
                    }
                    log(WIREGUARD_LOG_ERR, "parser windivert read failed", error);
                    break;
                }
                PWINDIVERT_IPHDR ip_header = NULL;
                PWINDIVERT_IPV6HDR ipv6_header = NULL;
                PWINDIVERT_UDPHDR udp_header = NULL;

                WinDivertHelperParsePacket(
                    packet, packet_l,
                    &ip_header, &ipv6_header,
                    NULL, NULL, NULL, NULL,
                    &udp_header, NULL, NULL, NULL, NULL
                );
                if (ip_header == NULL || udp_header == NULL)
                {
                    continue; // 非 IPv4/UDP，放行
                }
                uint16_t udp_len = ntohs(udp_header->Length);
                if (udp_len < (uint16_t)(sizeof(WINDIVERT_UDPHDR) + sizeof(multicast_marker)))
                {
                    continue; // 太短不可能是封装包
                }
                BYTE *payload = (BYTE *)udp_header + sizeof(WINDIVERT_UDPHDR);
                auto *m = (multicast_marker *)payload;
                if (m->magic != htonl(MULTICAST_MARKER_MAGIC))
                {
                    continue; // 普通 UDP，嗅探模式不干预，放行
                }

                // 识别为隧道组播，执行还原
                uint32_t orig_dst = m->orig_dst_addr;
                uint16_t payload_len = udp_len - (uint16_t)(sizeof(WINDIVERT_UDPHDR) + sizeof(multicast_marker));
                // 剥掉 8 字节标记头
                memmove(payload, payload + sizeof(multicast_marker), payload_len);
                udp_header->Length = htons((uint16_t)sizeof(WINDIVERT_UDPHDR) + payload_len);
                ip_header->Length = htons(ntohs(ip_header->Length) - (uint16_t)sizeof(multicast_marker));
                packet_l -= (uint32_t)sizeof(multicast_marker);
                // 恢复原始组播/广播目标地址
                ip_header->DstAddr = orig_dst;
                // 方向为入站；接口置 0 由系统自动选网卡，避免再次命中本 filter 造成环路
                addr.Outbound = 0;
                addr.Network.IfIdx = 0;
                addr.Network.SubIfIdx = 0;
                if (!WinDivertHelperCalcChecksums(packet, packet_l, &addr, 0))
                {
                    continue;
                }
                if (!WinDivertSend(inject, packet, packet_l, nullptr, &addr))
                {
                    log(WIREGUARD_LOG_ERR, "parser inject failed", GetLastError());
                }
            }
            // 线程自行关闭句柄，避免与 stop_trans 竞争
            WinDivertClose(inject);
            inject_handle.store(NULL, std::memory_order_release);
            WinDivertClose(rx);
            rx_handle.store(NULL, std::memory_order_release);
            log(WIREGUARD_LOG_INFO, "stop parser with filter: " + rx_filter);
        });
        braoder_thread.detach();
        parser_thread.detach();
    }

private:
    // 需要转发的ip地址
    std::unordered_set<uint32_t> peers;
    std::shared_mutex peer_rw_lock;
    std::thread braoder_thread;
    std::thread parser_thread;
    std::atomic<bool> stop{false};
    static std::atomic<HANDLE> windivert_handle; // 发送端嗅探句柄
    static std::atomic<HANDLE> rx_handle;        // 接收端嗅探句柄
    static std::atomic<HANDLE> inject_handle;    // 接收端注入句柄
    transporter() = default;
};

const char *transporter::multicast_filter = "outbound and (ip.DstAddr == 255.255.255.255 or (ip.DstAddr >= 224.0.0.0 and ip.DstAddr <= 239.255.255.255)) and ifIdx !=";
transporter transporter::bt_instance;
std::atomic<HANDLE> transporter::windivert_handle{NULL};
std::atomic<HANDLE> transporter::rx_handle{NULL};
std::atomic<HANDLE> transporter::inject_handle{NULL};

extern "C"
{
    EXPORT void add_trans_ips(const char **ips, size_t count)
    {
        transporter::getInstance().add_ips(ips, count);
    }

    EXPORT void del_trans_ips(const char **ips, size_t count)
    {
        transporter::getInstance().del_ips(ips, count);
    }
}
