#include <unordered_map>
#include <string>
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

#define EXPORT __declspec(dllexport)

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

    static constexpr WIREGUARD_INTERFACE_FLAG BASE_FLAG = WIREGUARD_INTERFACE_HAS_LISTEN_PORT | WIREGUARD_INTERFACE_HAS_PRIVATE_KEY |
                                                          WIREGUARD_INTERFACE_HAS_PUBLIC_KEY;
    static constexpr WIREGUARD_PEER_FLAG BASE_PEER_FLAG = WIREGUARD_PEER_HAS_PUBLIC_KEY | WIREGUARD_PEER_HAS_ENDPOINT |
                                                          WIREGUARD_PEER_HAS_PERSISTENT_KEEPALIVE;

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
        auto &trans = broadcast_trans::getInstance();
        trans.run();
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
        auto &trans = broadcast_trans::getInstance();
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
        auto handle = WireGuardCreateAdapter(name, L"WireGuard Tunnel", nullptr);
        if (handle == nullptr)
        {
            return false;
        }
        // 创建配置并设置适配器
        auto conf = std::make_unique<room_config>(handle, name, public_key, private_key, listen_port);
        if (!conf->set_config() || !bind_adapter(handle, adapter_ip, ip_area))
        {
            WireGuardCloseAdapter(handle);
            log(WIREGUARD_LOG_ERR, "adapter create failed", GetLastError());
            return false;
        }
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
        WireGuardCloseAdapter(rooms[name]->handle);
        log_dll(WIREGUARD_LOG_INFO, 0, std::wstring(L"adapter deleted of room:").append(name).c_str());
        rooms.erase(name);
    }

    // 添加成员并修改wireguard适配器配置
    _NODISCARD bool add_peer(const wchar_t *adapter_name, const wchar_t *peer_name, const u_char *pub_key,
                             const char *ip, uint16_t port, const char **allowed_ips, size_t allowed_ip_count, bool as_transporter)
    {
        if (rooms.find(adapter_name) == rooms.end())
        {
            log(WIREGUARD_LOG_ERR, "add peer failed for not exist room");
            return false;
        };
        auto &room = rooms[adapter_name];
        WIREGUARD_PEER new_peer = {};
        if (room->peers.find(peer_name) != room->peers.end())
        {
            log(WIREGUARD_LOG_ERR, "add peer existed");
            return false;
        }
        new_peer.Flags = room_config::BASE_PEER_FLAG;
        new_peer.PersistentKeepalive = 15;
        // 设置对端真实地址
        if (!parse_ip(ip, port, new_peer.Endpoint))
        {
            log(WIREGUARD_LOG_ERR, "peer endpoint format error");
            return false;
        }
        memcpy(new_peer.PublicKey, pub_key, WIREGUARD_KEY_LENGTH);
        new_peer.AllowedIPsCount = allowed_ip_count;
        room->peers[peer_name] = new_peer;
        // 初始化转发IP列表
        room->interface_config.PeersCount = room->peers.size();
        room->peer_allowed_ips[peer_name] = std::vector<WIREGUARD_ALLOWED_IP>();
        for (size_t i = 0; i < allowed_ip_count; i++)
        {
            WIREGUARD_ALLOWED_IP allowed_ip = {};
            if (!parse_allowed_ip(std::string(allowed_ips[i]), allowed_ip))
            {
                log(WIREGUARD_LOG_WARN, std::string("allowed_ip format failed: ") + allowed_ips[i]);
                continue;
            }
            room->peer_allowed_ips[peer_name].push_back(allowed_ip);
        }
        // 配置失败回退
        if (!room->set_config())
        {
            room->peers.erase(peer_name);
            room->peer_allowed_ips.erase(peer_name);
            room->interface_config.PeersCount = room->peers.size();
            return false;
        };
        // 非中转服务器，添加到广播转发列表
        if (!as_transporter)
        {
            auto &trans = broadcast_trans::getInstance();
            trans.add_peer(room->peer_allowed_ips[peer_name].data(), room->peer_allowed_ips[peer_name].size());
        }
        return true;
    }

    bool update_peer_endpoint(const wchar_t *adapter_name, const wchar_t *peer_name, const char *ip, uint16_t port)
    {
        if (rooms.find(adapter_name) == rooms.end())
        {
            log(WIREGUARD_LOG_ERR, "update peer failed for not exist room");
            return false;
        };
        auto &room = rooms[adapter_name];
        if (room->peers.find(peer_name) == room->peers.end())
        {
            log(WIREGUARD_LOG_ERR, "update peer not existed");
            return false;
        }
        auto old = room->peers[peer_name].Endpoint;
        if (!parse_ip(ip, port, room->peers[peer_name].Endpoint))
        {
            log(WIREGUARD_LOG_ERR, "parse new endpoint failed");
            return false;
        }
        room->peers[peer_name].Flags |= WIREGUARD_PEER_UPDATE_ONLY;
        if (!room->set_config())
        {
            room->peers[peer_name].Endpoint = old;
            room->peers[peer_name].Flags = room_config::BASE_PEER_FLAG;
            return false;
        };
        room->peers[peer_name].Flags = room_config::BASE_PEER_FLAG;
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
        room->peers[peer_name].Flags = WIREGUARD_PEER_REMOVE;
        if (!room->set_config())
        {
            log(WIREGUARD_LOG_ERR, "remove adapter peer failed");
        }
        room->peers.erase(peer_name);
        room->peer_allowed_ips.erase(peer_name);
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
                             const char **allowed_ips, int allowed_ips_count, bool as_transporter)
    {
        auto &handle = WireGuardHandle::getInstance();
        if (wg == nullptr)
            return {1, L"wireguard.dll unload"};
        if (!handle.add_peer(room_name, peer_name, public_key, ip, port, allowed_ips, allowed_ips_count, as_transporter))
            return {1, L"add peer failed"};
        return {0, L"success"};
    }

    EXPORT response update_peer_endpoint(const wchar_t *room_name, const wchar_t *peer_name, const char *ip, uint16_t port)
    {
        auto &handle = WireGuardHandle::getInstance();
        if (wg == nullptr)
            return {1, L"wireguard.dll unload"};
        if (!handle.update_peer_endpoint(room_name, peer_name, ip, port))
        {
            return {1, L"update failed"};
        };
        return {0, L"success"};
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
    if (const auto ok = handle.add_peer(L"test", L"peer1", peer_key, "192.168.0.100", 8767, allowed_ips, 1, false); !ok)
    {
        return 0;
    }

    std::cout << "Second Conf:" << get_wg_conf(handle.rooms[L"test"]->handle) << '\n';
    handle.del_room(L"test");
    return 0;
}
