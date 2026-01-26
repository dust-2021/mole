#include "src/wireguard.h"
#include "wireguard_tool.cpp"
#include "src/windivert.h"
#include "shared_mutex"
#include "thread"
#include "unordered_set"
#include "atomic"

#pragma comment(lib, "lib/src/WinDivert.lib")

bool isLittleEndianSimple() {
    uint16_t test = 0x0001;
    return *reinterpret_cast<uint8_t*>(&test) == 0x01;
}

// 用于转发三层网络中的广播数据包到wireguard隧道
class broadcast_trans
{
public:
    static const char *filter;
    static broadcast_trans bt_instance;

    broadcast_trans(const broadcast_trans &b) = delete;
    broadcast_trans &operator=(const broadcast_trans &) = delete;

    static broadcast_trans &getInstance()
    {
        return bt_instance;
    }

    void add_peer(uint32_t ip)
    {
        // 虚拟局域网网段内前两个地址不进行转发
        if (ip & 0xffff <= 1)
            return;
        std::unique_lock<std::shared_mutex> lock(peer_rw_lock);
        peers.insert(ip);
    }

    void add_peer(const WIREGUARD_ALLOWED_IP *ip, size_t count)
    {
        std::unique_lock<std::shared_mutex> lock(peer_rw_lock);
        for (size_t i = 0; i < count; i++)
        {
            if (ip[i].Address.V4.S_un.S_addr & 0xffff <= 1)
            {
                continue;
            }
            peers.insert(ip[i].Address.V4.S_un.S_addr);
        }
    }

    void del_peer(uint32_t ip)
    {
        std::unique_lock<std::shared_mutex> lock(peer_rw_lock);
        peers.erase(ip);
    }

    void del_peer(const WIREGUARD_ALLOWED_IP *ip, size_t count)
    {
        std::unique_lock<std::shared_mutex> lock(peer_rw_lock);
        for (size_t i = 0; i < count; i++)
        {
            peers.erase(ip[i].Address.V4.S_un.S_addr);
        }
    }

    void stop_trans() {
        stop = true;
        WinDivertClose(windivert_handle);
    }

    void run()
    {
        j = std::thread([this]
                        {
            if(windivert_handle == INVALID_HANDLE_VALUE) return;

            WINDIVERT_ADDRESS addr;
            char packet[0xffff];
            uint32_t packet_l;
            log(WIREGUARD_LOG_INFO, "start layer 3 broadcast transport");
            while(!stop) {
                if(!WinDivertRecv(windivert_handle, packet, sizeof(packet), &packet_l, &addr)) {
                    auto error = GetLastError();
                    if (error == ERROR_TIMEOUT || error == ERROR_HOST_UNREACHABLE) {
                    continue;
                }
                
                if (error == ERROR_INVALID_HANDLE || error == ERROR_OPERATION_ABORTED) {
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
                if (ip_header == NULL) {
                    log(WIREGUARD_LOG_ERR, "parse broadcast data failed");
                    continue;
                }
                // 
                std::shared_lock<std::shared_mutex> lock(peer_rw_lock);
                for (const auto & p: peers) {
                    ip_header->DstAddr = p;
                    if(!WinDivertHelperCalcChecksums(packet, packet_l, &addr, 0)) continue;
                    WinDivertSend(windivert_handle, packet, packet_l, nullptr, &addr);
                };
                lock.unlock();
            };
            log(WIREGUARD_LOG_INFO, "stop layer 3 broadcast transport"); });
        j.detach();
    }

private:
    // 需要转发的ip地址
    std::unordered_set<uint32_t> peers;
    std::shared_mutex peer_rw_lock;
    std::thread j;
    std::atomic<bool> stop{false};
    static HANDLE windivert_handle;

    broadcast_trans(){
        // 获取windivert句柄，设置为嗅探模式
        windivert_handle = WinDivertOpen(filter, WINDIVERT_LAYER_NETWORK, 0, WINDIVERT_FLAG_SNIFF);
        if (windivert_handle == INVALID_HANDLE_VALUE)
        {
            log(WIREGUARD_LOG_ERR, "load windivert failed", GetLastError());
        };
    }
};

const char *broadcast_trans::filter = "outbound and ip.DstAddr == 255.255.255.255";
broadcast_trans broadcast_trans::bt_instance;
HANDLE broadcast_trans::windivert_handle = NULL;