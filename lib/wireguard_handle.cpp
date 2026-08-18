#include <unordered_map>
#include <string>
#include <vector>
#include <optional>
#include "src/wireguard.h"
#include "wireguard_tool.cpp"
#include "broadcaster.cpp"
#include <memory>
#include "mutex"
#include "chrono"
#include <iostream>

#include "winsock2.h"
#include "ws2tcpip.h"

#pragma comment(lib, "ws2_32.lib")

// 抽象room配置类，对应一个房间和一个wireguard adapter
class room_config
{
    // 生成配置数据，返回配置数据指针大小，0则代表生成失败
    size_t generate_config()
    {
        size_t total_size = interface_size + peers.size() * peer_size;
        // 添加每个peer的allowed_ip大小
        for (const auto &[k, v] : peer_allowed_ips)
        {
            total_size += peer_allowed_ips[k].size() * allowed_ip_size;
        }
        const auto new_ptr = realloc(conf, total_size);
        if (new_ptr == nullptr)
        {
            return 0;
        }
        conf = new_ptr;
        size_t offset = 0;
        // 逐步复制数据
        memcpy(conf, &(this->interface_config), interface_size);
        offset += interface_size;
        for (const auto &[key, peer] : peers)
        {
            memcpy(reinterpret_cast<BYTE *>(conf) + offset, &peer, peer_size);
            offset += peer_size;
            if (peer.AllowedIPsCount == 0)
            {
                continue;
            }
            // 转发虚拟IP地址错误
            if (peer_allowed_ips.find(key) == peer_allowed_ips.end())
            {
                log(WIREGUARD_LOG_ERR, "parse peer transport failed");
                return 0;
            };
            for (const auto &ip : peer_allowed_ips[key])
            {
                memcpy(reinterpret_cast<BYTE *>(conf) + offset, &ip, allowed_ip_size);
                offset += allowed_ip_size;
            }
        }
        return total_size;
    }

public:
    std::wstring name;
    // 绑定的 IP 和网段（用于删除时清理）
    std::string adapter_ip;
    std::string adapter_ip_area;
    // wireguard 适配器配置
    WIREGUARD_INTERFACE interface_config{};
    // wireguard 适配器对等体配置
    std::unordered_map<std::wstring, WIREGUARD_PEER> peers;
    // wireguard 适配器对等体允许的IP配置
    std::unordered_map<std::wstring, std::vector<WIREGUARD_ALLOWED_IP>> peer_allowed_ips;

    // wireguard 适配器匿名句柄
    WIREGUARD_ADAPTER_HANDLE handle = nullptr;
    // 特定内存布局的wireguard配置
    // interface + peer1 + allowed_ip1 + allowed_ip2 + peer2 + allowed + ...
    void *conf = nullptr;

    static constexpr WIREGUARD_INTERFACE_FLAG BASE_FLAG = WIREGUARD_INTERFACE_HAS_LISTEN_PORT | WIREGUARD_INTERFACE_HAS_PRIVATE_KEY;
    static constexpr WIREGUARD_PEER_FLAG BASE_PEER_FLAG = WIREGUARD_PEER_HAS_PUBLIC_KEY  | WIREGUARD_PEER_HAS_PERSISTENT_KEEPALIVE;

    // 设置适配器参数
    _NODISCARD bool set_config()
    {
        auto size_of_config = generate_config();
        if (size_of_config == 0)
        {
            return false;
        }
        // 设置配置
        if (WireGuardSetConfiguration(handle, static_cast<WIREGUARD_INTERFACE *>(conf), size_of_config) != 0)
            return true;
        log(WIREGUARD_LOG_ERR, "set configuration failed", GetLastError());
        return false;
    }

    room_config(const WIREGUARD_ADAPTER_HANDLE &handle, std::wstring name,
                const u_char *public_key, const u_char *private_key,
                const uint16_t listen_port) noexcept : name(name), handle(handle)
    {
        memcpy(interface_config.PublicKey, public_key, WIREGUARD_KEY_LENGTH);
        memcpy(interface_config.PrivateKey, private_key, WIREGUARD_KEY_LENGTH);
        interface_config.ListenPort = listen_port;
        interface_config.PeersCount = 0;

        interface_config.Flags = BASE_FLAG | WIREGUARD_INTERFACE_REPLACE_PEERS;
    };

    ~room_config()
    {
        free(conf);
    };
};

/**
 * 管理器单例
 */
class WireGuardHandle
{
private:
    static void init()
    {
        // 初始化winsock
        WSADATA wsaData;
        if (const int iResult = WSAStartup(MAKEWORD(2, 2), &wsaData); iResult != 0)
        {
            log(WIREGUARD_LOG_ERR, "load ws2 failed", GetLastError());
        }
        // 加载dll
        initial();
        WireGuardSetLogger((WIREGUARD_LOGGER_CALLBACK)&log_dll);
        // 初始化广播转发器
        auto &trans = transporter::getInstance();
        log(WIREGUARD_LOG_INFO, "handler created");
    }

    WireGuardHandle()
    {
        rooms = std::unordered_map<std::wstring, std::unique_ptr<room_config>>();
    };

public:
    static WireGuardHandle h_instance;
    static std::once_flag initInstanceFlag;
    std::unordered_map<std::wstring, std::unique_ptr<room_config>> rooms;
    WireGuardHandle(const WireGuardHandle &) = delete;

    WireGuardHandle &operator=(const WireGuardHandle &) = delete;

    void clear()
    {
        for (auto &room : rooms)
        {
            WireGuardCloseAdapter(room.second->handle);
        }
        rooms.clear();
        // 释放winsock
        WSACleanup();
        FreeLibrary(wg);
        auto &trans = transporter::getInstance();
        trans.stop_trans();
        log(WIREGUARD_LOG_INFO, "handler closed");
    }

    static WireGuardHandle &getInstance()
    {
        std::call_once(WireGuardHandle::initInstanceFlag, []()
                       { init(); });
        return h_instance;
    };

    // 创建适配器对象，已存在则直接返回
    _NODISCARD bool create_room(const wchar_t *name, const u_char *public_key,
                                const u_char *private_key, const char *adapter_ip, const char *ip_area, uint16_t listen_port)
    {
        if (rooms.find(name) != rooms.end())
        {
            return true;
        }
        // TODO: 由于中转服务器存在，目前只支持一个房间，后续可扩展为多个房间
        if (rooms.size() != 0)
        {
            log(WIREGUARD_LOG_ERR, "only support one room");
            return false;
        }
        auto handle = WireGuardCreateAdapter(name, L"WireGuard Tunnel", nullptr);
        if (handle == nullptr)
        {   
            log(WIREGUARD_LOG_ERR, "adapter create failed", GetLastError());
            return false;
        }
        // 创建配置并设置适配器
        auto conf = std::make_unique<room_config>(handle, name, public_key, private_key, listen_port);
        conf->adapter_ip = adapter_ip;
        conf->adapter_ip_area = ip_area;
        if (!conf->set_config())
        {
            WireGuardCloseAdapter(handle);
            log(WIREGUARD_LOG_ERR, "adapter create failed", GetLastError());
            return false;
        }
        auto interface_index = bind_adapter(handle, adapter_ip, ip_area);
        if (interface_index == 0)
        {
            WireGuardCloseAdapter(handle);
            log(WIREGUARD_LOG_ERR, "adapter bind failed", GetLastError());
            return false;
        }
        // 启动广播和组播转发
        // TODO: 多房间时修改转发器逻辑
        auto& trans = transporter::getInstance();
        trans.run(interface_index, adapter_ip);
        // 去除清空peer的状态码
        conf->interface_config.Flags = room_config::BASE_FLAG;
        rooms[name] = std::move(conf);
        log_dll(WIREGUARD_LOG_INFO, 0, std::wstring(L"adapter created of room:").append(name).c_str());
        return true;
    };

    void del_room(const wchar_t *name)
    {
        if (rooms.find(name) == rooms.end())
        {
            return;
        }
        auto &room = rooms[name];
        // 清理虚拟网卡 IP 和路由
        unbind_adapter(room->handle, room->adapter_ip.c_str(), room->adapter_ip_area.c_str());
        // 清空 peers 配置
        room->peers.clear();
        room->peer_allowed_ips.clear();
        room->interface_config.PeersCount = 0;
        room->interface_config.Flags = room_config::BASE_FLAG | WIREGUARD_INTERFACE_REPLACE_PEERS;
        room->set_config();
        WireGuardCloseAdapter(room->handle);
        log_dll(WIREGUARD_LOG_INFO, 0, std::wstring(L"adapter deleted of room:").append(name).c_str());
        rooms.erase(name);
        // TODO: 多房间时添加额外识别逻辑
        auto& trans = transporter::getInstance();
        trans.stop_trans();
    }

    // 添加成员并修改wireguard适配器配置
    // 已存在的 peer 允许重复添加：用于更新 endpoint 等配置，直接重赋值 peer 结构体并重新设置 wg
    _NODISCARD bool add_peer(const wchar_t *adapter_name, const wchar_t *peer_name, const u_char *pub_key,
                             const char *ip, uint16_t port, const char **allowed_ips, size_t allowed_ip_count)
    {
        if (rooms.find(adapter_name) == rooms.end())
        {
            log(WIREGUARD_LOG_ERR, "add peer failed for not exist room");
            return false;
        };
        auto &room = rooms[adapter_name];
        // 是否更新已有 peer
        const bool existed = room->peers.find(peer_name) != room->peers.end();

        WIREGUARD_PEER new_peer = {};
        new_peer.Flags = room_config::BASE_PEER_FLAG;
        new_peer.PersistentKeepalive = 15;
        // 设置对端真实地址
        if (ip != nullptr && ip[0] != '\0') {
            new_peer.Flags |= WIREGUARD_PEER_HAS_ENDPOINT;
            if(!parse_ip(ip, port, new_peer.Endpoint))
            {
                log(WIREGUARD_LOG_ERR, "peer endpoint format error");
                return false;
            }
        }
        memcpy(new_peer.PublicKey, pub_key, WIREGUARD_KEY_LENGTH);
        new_peer.AllowedIPsCount = allowed_ip_count;

        // 先解析 allowed_ips 到临时列表，避免解析失败时污染已有配置
        std::vector<WIREGUARD_ALLOWED_IP> new_allowed;
        for (size_t i = 0; i < allowed_ip_count; i++)
        {
            WIREGUARD_ALLOWED_IP allowed_ip = {};
            if (!parse_allowed_ip(std::string(allowed_ips[i]), allowed_ip))
            {
                log(WIREGUARD_LOG_WARN, std::string("allowed_ip format failed: ") + allowed_ips[i]);
                continue;
            }
            new_allowed.push_back(allowed_ip);
        }

        // 更新已有 peer 时保存旧配置，用于配置失败时回滚
        std::optional<WIREGUARD_PEER> old_peer;
        std::optional<std::vector<WIREGUARD_ALLOWED_IP>> old_allowed;
        if (existed)
        {
            old_peer = room->peers[peer_name];
            old_allowed = room->peer_allowed_ips[peer_name];
        }

        room->peers[peer_name] = new_peer;
        room->interface_config.PeersCount = room->peers.size();
        room->peer_allowed_ips[peer_name] = new_allowed;

        // 配置失败回退：更新已有 peer 时恢复旧配置，新增 peer 时删除
        if (!room->set_config())
        {
            if (existed && old_peer.has_value() && old_allowed.has_value())
            {
                room->peers[peer_name] = *old_peer;
                room->peer_allowed_ips[peer_name] = *old_allowed;
            }
            else
            {
                room->peers.erase(peer_name);
                room->peer_allowed_ips.erase(peer_name);
            }
            room->interface_config.PeersCount = room->peers.size();
            return false;
        };
        return true;
    }

    // 删除适配器中的成员
    void del_peer(const wchar_t *adapter_name, const wchar_t *peer_name)
    {
        if (rooms.find(adapter_name) == rooms.end())
            return;
        auto &room = rooms[adapter_name];
        if (room->peers.find(peer_name) == room->peers.end())
            return;
        // 设置删除
        auto &peer = room->peers[peer_name];
        peer.Flags = WIREGUARD_PEER_REMOVE | WIREGUARD_PEER_HAS_PUBLIC_KEY;
        if (!room->set_config())
        {
            log(WIREGUARD_LOG_ERR, "remove adapter peer failed");
        }
        room->peer_allowed_ips.erase(peer_name);
        room->peers.erase(peer_name);
        room->interface_config.PeersCount = room->peers.size();
    }

    bool run_adapter(const wchar_t *name)
    {
        if (rooms.find(name) == rooms.end())
        {
            return false;
        }
        return WireGuardSetAdapterState(rooms[name]->handle, WIREGUARD_ADAPTER_STATE_UP);
    }

    bool pause_adapter(const wchar_t *name)
    {
        if (rooms.find(name) == rooms.end())
        {
            return false;
        }
        return WireGuardSetAdapterState(rooms[name]->handle, WIREGUARD_ADAPTER_STATE_DOWN);
    }
};

std::once_flag WireGuardHandle::initInstanceFlag;
WireGuardHandle WireGuardHandle::h_instance;

// ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// |-------------------------- 导出函数定义 --------------------------- |
// ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

extern "C"
{
    /**
     * 设置全局日志回调
     * @param cb: 回调函数指针
     */
    EXPORT void set_logger(void (*cb)(WIREGUARD_LOGGER_LEVEL level, const char *msg, int code))
    {
        log_func = cb;
    }

    /**
     * 创建vlan房间
     * @param name: 房间名 @param public_key: 32位uint8类型的curve25519公钥 @param private_key: 32位uint8类型的curve25519私钥 @param port: 本机转发端口
     */
    EXPORT response create_adapter(const wchar_t *name, const u_char *public_key, const u_char *private_key, const char *adapter_ip,
                                   const char *ip_area, uint16_t port)
    {
        auto &handle = WireGuardHandle::getInstance();
        if (wg == nullptr)
            return {1, L"wireguard.dll unload"};
        if (!handle.create_room(name, public_key, private_key, adapter_ip, ip_area, port))
            return {1, L"create adapter failed"};
        return {0, L"success"};
    }

    /**
     * 删除房间
     * @param name: 房间名
     */
    EXPORT response del_adapter(const wchar_t *name)
    {
        auto &handle = WireGuardHandle::getInstance();
        if (wg == nullptr)
            return {1, L"wireguard.dll unload"};
        handle.del_room(name);
        return {0, L"success"};
    }

    /**
     * 添加房间成员
     * @param room_name: 房间适配器名 @param peer_name: 成员名 @param ip: 成员通信IP @param port: 成员通信端口 @param public_key: 成员ed25519公钥
     * @param allowed_ips: 成员虚拟局域网网转发IP @param allowed_ips_count: 转发IP数量
     */
    EXPORT response add_peer(const wchar_t *room_name, const wchar_t *peer_name, const char *ip, const uint16_t port, const u_char *public_key,
                             const char **allowed_ips, int allowed_ips_count)
    {
        auto &handle = WireGuardHandle::getInstance();
        if (wg == nullptr)
            return {1, L"wireguard.dll unload"};
        if (!handle.add_peer(room_name, peer_name, public_key, ip, port, allowed_ips, allowed_ips_count))
            return {1, L"add peer failed"};
        return {0, L"success"};
    }

    EXPORT void add_trans(const char ** ips, size_t count) {
        auto & trans = transporter::getInstance();
    }

    EXPORT response del_peer(const wchar_t *room_name, const wchar_t *peer_name)
    {
        auto &handle = WireGuardHandle::getInstance();
        if (wg == nullptr)
            return {1, L"wireguard.dll unload"};
        handle.del_peer(room_name, peer_name);
        return {0, L"success"};
    }

    EXPORT response run_adapter(const wchar_t *name)
    {
        auto &handle = WireGuardHandle::getInstance();
        if (wg == nullptr)
            return {1, L"wireguard.dll unload"};
        if (!handle.run_adapter(name))
            return {1, L"adapter run failed"};
        return {0, L"success"};
    }

    EXPORT response pause_adapter(const wchar_t *name)
    {
        auto &handle = WireGuardHandle::getInstance();
        if (wg == nullptr)
            return {1, L"wireguard.dll unload"};
        handle.pause_adapter(name);
        return {0, L"success"};
    }

    EXPORT response get_adapter_config(const wchar_t *name, char *buffer, int l)
    {
        auto &handle = WireGuardHandle::getInstance();
        if (wg == nullptr)
            return {1, L"wireguard.dll unload"};
        if (handle.rooms.find(name) == handle.rooms.end())
            return {1, L"adapter not exist"};
        auto conf = get_wg_conf(handle.rooms[name]->handle);
        if (conf.length() > l)
            return {1, L"buffer too small"};
        strcpy(buffer, conf.c_str());
        return {0, L"success"};
    }

    EXPORT void clear_all()
    {
        auto &handle = WireGuardHandle::getInstance();
        handle.clear();
    }
}
namespace test
{
    void __stdcall test_log(const WIREGUARD_LOGGER_LEVEL level, const char *msg, int code)
    {
        // 毫秒时间戳
        unsigned long long timestamp;
        const auto now = std::chrono::system_clock::now();
        timestamp = std::chrono::duration_cast<std::chrono::milliseconds>(
                        now.time_since_epoch())
                        .count();
        std::wcout << timestamp << "-code:" << level << ',' << msg << '\n';
    }

    void set_logger()
    {
        log_func = &test_log;
    }
}

int main()
{
    test::set_logger();
    auto &handle = WireGuardHandle::getInstance();
    // ed25519公私钥
    const u_char pub_key[] = {
        84, 28, 11, 0, 37, 145, 159, 133,
        154, 18, 242, 47, 200, 53, 112, 25,
        116, 81, 254, 120, 17, 66, 232, 6,
        69, 61, 152, 77, 228, 135, 155, 111};
    const u_char pri_key[] = {
        112, 81, 202, 65, 122, 125, 117,
        158, 137, 213, 59, 159, 25, 184,
        224, 252, 205, 239, 30, 253, 28,
        144, 51, 178, 104, 128, 25, 169,
        103, 252, 146, 65};
    if (!handle.create_room(L"test", pub_key, pri_key, "10.20.0.2", "10.20.0.0", 8080))
    {
        std::cout << "adapter create failed" << std::endl;
        return 0;
    }
    if (!handle.run_adapter(L"test"))
    {
        return 0;
    }
    std::cout << "First conf:" << get_wg_conf(handle.rooms[L"test"]->handle) << '\n';
    const u_char peer_key[] = {
        113, 54, 183, 51, 253, 208, 0, 141, 85, 73, 153, 40, 209, 110, 24, 169, 158, 172, 204, 231, 13, 52, 53, 46, 53,
        186, 9, 64, 182, 167, 28, 130};
    const char *allowed_ips[] = {"10.0.0.1/32"};
    if (const auto ok = handle.add_peer(L"test", L"peer1", peer_key, "192.168.0.100", 8767, allowed_ips, 1); !ok)
    {
        return 0;
    }
    const u_char peer2_key[] = {
        113, 54, 183, 51, 253, 208, 0, 88, 85, 73, 47, 40, 209, 110, 24, 169, 158, 172, 204, 231, 13, 52, 53, 46, 53,
        186, 9, 64, 182, 167, 28, 130};
    const char *allowed_ips2[] = {"10.0.0.2/32"};
    if (const auto ok = handle.add_peer(L"test", L"peer2", peer2_key, "192.168.0.101", 8769, allowed_ips2, 1); !ok)
    {
        return 0;
    }

    std::cout << "Second Conf:" << get_wg_conf(handle.rooms[L"test"]->handle) << '\n';
    // handle.del_peer(L"test", L"peer1");
    std::cout << "Third Conf:" << get_wg_conf(handle.rooms[L"test"]->handle) << '\n';
    handle.del_room(L"test");
    return 0;
}
