#include "src/wireguard.h"
#include "wireguard_tool.cpp"
#include "src/windivert.h"
#include "shared_mutex"
#include "thread"
#include "unordered_set"
#include "atomic"

#pragma comment(lib, "lib/src/WinDivert.lib")

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
        // 关闭接收通道，让阻塞中的 WinDivertRecv 立即返回 ERROR_OPERATION_ABORTED，
        // 接收线程随后自行退出并关闭句柄，避免跨线程关闭句柄产生竞争
        HANDLE h = windivert_handle.load(std::memory_order_acquire);
        if (h != NULL && h != INVALID_HANDLE_VALUE)
        {
            WinDivertShutdown(h, WINDIVERT_SHUTDOWN_RECV);
        }
    }

    void run(DWORD wg_idx)
    {   
        // 广播转发线程，复制所有广播到每个peer
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
        braoder_thread.detach();
    }

private:
    // 需要转发的ip地址
    std::unordered_set<uint32_t> peers;
    std::shared_mutex peer_rw_lock;
    std::thread braoder_thread;
    std::atomic<bool> stop{false};
    static std::atomic<HANDLE> windivert_handle;

    transporter() = default;
};

const char *transporter::multicast_filter = "outbound and (ip.DstAddr == 255.255.255.255 or (ip.DstAddr >= 224.0.0.0 and ip.DstAddr <= 239.255.255.255)) and ifIdx !=";
transporter transporter::bt_instance;
std::atomic<HANDLE> transporter::windivert_handle{NULL};

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
