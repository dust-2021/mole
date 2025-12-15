#include <unordered_map>
#include <string>
#include "src/wireguard.h"
#include <memory>
#include "mutex"
#include "chrono"
#include <iostream>

#include "winsock2.h"
#include "ws2tcpip.h"

#include <filesystem>

namespace fs = std::filesystem;

#pragma comment(lib, "ws2_32.lib")

#define EXPORT __declspec(dllexport)

static WIREGUARD_CREATE_ADAPTER_FUNC *WireGuardCreateAdapter;
static WIREGUARD_OPEN_ADAPTER_FUNC *WireGuardOpenAdapter;
static WIREGUARD_CLOSE_ADAPTER_FUNC *WireGuardCloseAdapter;
static WIREGUARD_GET_ADAPTER_LUID_FUNC *WireGuardGetAdapterLUID;
static WIREGUARD_GET_RUNNING_DRIVER_VERSION_FUNC *WireGuardGetRunningDriverVersion;
static WIREGUARD_DELETE_DRIVER_FUNC *WireGuardDeleteDriver;
static WIREGUARD_SET_LOGGER_FUNC *WireGuardSetLogger;
static WIREGUARD_SET_ADAPTER_LOGGING_FUNC *WireGuardSetAdapterLogging;
static WIREGUARD_GET_ADAPTER_STATE_FUNC *WireGuardGetAdapterState;
static WIREGUARD_SET_ADAPTER_STATE_FUNC *WireGuardSetAdapterState;
static WIREGUARD_GET_CONFIGURATION_FUNC *WireGuardGetConfiguration;
static WIREGUARD_SET_CONFIGURATION_FUNC *WireGuardSetConfiguration;

static HMODULE wg = nullptr;

static constexpr size_t interface_size = sizeof(WIREGUARD_INTERFACE);
static constexpr size_t peer_size = sizeof(WIREGUARD_PEER);
static constexpr size_t allowed_ip_size = sizeof(WIREGUARD_ALLOWED_IP);

// 外部日志函数钩子
static void (*log_func)(WIREGUARD_LOGGER_LEVEL level, const char *msg) = nullptr;

void log_dll(const WIREGUARD_LOGGER_LEVEL level, int64_t dt, const wchar_t *msg)
{
    if (log_func == nullptr)
    {
        return;
    }
    int size_needed = WideCharToMultiByte(CP_UTF8, 0, msg, -1, NULL, 0, NULL, NULL);
    std::string str(size_needed, 0);
    WideCharToMultiByte(CP_UTF8, 0, msg, -1, &str[0], size_needed, NULL, NULL);
    log_func(level, str.c_str());
}

static std::string env = "";

void log(const WIREGUARD_LOGGER_LEVEL level, const char *msg)
{
    if (log_func == nullptr)
    {
        return;
    }
    log_func(level, msg);
}

std::wstring GetErrorMessage(const DWORD errorCode)
{
    // 获取错误消息的缓冲区大小
    const auto msgBuffer = static_cast<wchar_t *>(malloc(256));
    const DWORD size = FormatMessageW(
        FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM,
        nullptr,
        errorCode,
        0,
        msgBuffer,
        0,
        nullptr);

    std::wstring msgW;
    if (size)
    {
        msgW = std::wstring(msgBuffer, size);
    }
    else
    {
        msgW = L"Unknown error code: " + std::to_wstring(errorCode);
    }
    free(msgBuffer);
    return msgW;
}

enum ffi_error_code
{
    ffi_success = 0,
    ffi_wireguard_dll_unload = 1,
    ffi_adapter_create_err = 2,
    ffi_adapter_run_err = 3,
    ffi_add_peer_err = 4,
};

struct response
{
    ffi_error_code code;
    const wchar_t *msg;
};

// 加载wireguard动态库
void initial()
{
    auto curdir = fs::current_path();
    auto dll_dir = L"resource/wireguard/wireguard.dll"; // electron打包完成后
    if (env == "dev")                                   // electron调试
    {
        dll_dir = L"lib/src/wireguard.dll";
    }
    else if (env == "debug-dll") // dll调试
    {
        dll_dir = L"src/wireguard.dll";
    }
    auto fullpath = curdir / dll_dir;
    wg =
        LoadLibraryExW(fullpath.c_str(), nullptr,

                       LOAD_LIBRARY_SEARCH_APPLICATION_DIR | LOAD_LIBRARY_SEARCH_SYSTEM32);
    if (wg == nullptr)
    {
        log(WIREGUARD_LOG_INFO, "load wireguard failed");
        return;
    }
#define X(Name) ((*(FARPROC *)&Name = GetProcAddress(wg, #Name)) == NULL)
    if (X(WireGuardCreateAdapter) || X(WireGuardOpenAdapter) || X(WireGuardCloseAdapter) ||
        X(WireGuardGetAdapterLUID) || X(WireGuardGetRunningDriverVersion) || X(WireGuardDeleteDriver) ||
        X(WireGuardSetLogger) || X(WireGuardSetAdapterLogging) || X(WireGuardGetAdapterState) ||
        X(WireGuardSetAdapterState) || X(WireGuardGetConfiguration) || X(WireGuardSetConfiguration))
#undef X
    {
        return;
    }
}

class wireguard_adapter : public std::enable_shared_from_this<wireguard_adapter>
{

    WIREGUARD_INTERFACE interface_config{};
    // 生成配置数据，返回配置数据指针大小，0则代表生成失败
    size_t generate_config()
    {
        size_t total_size = interface_size + peers.size() * peer_size + peer_transport.size() * allowed_ip_size;

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
            // 转发虚拟IP地址错误
            if (peer.AllowedIPsCount != 1 || peer_transport.find(key) == peer_transport.end())
            {
                return 0;
            };

            auto temp = peer_transport[key];
            WIREGUARD_ALLOWED_IP allowed_ip = {};
            allowed_ip.Cidr = temp.second;
            if (int result = inet_pton(AF_INET, temp.first.c_str(), &allowed_ip.Address.V4); result == 1)
            {
                allowed_ip.AddressFamily = AF_INET;
            }
            else
            // TODO ipv6是否必要
            {
                result = inet_pton(AF_INET6, temp.first.c_str(), &allowed_ip.Address.V6);
                if (result == 1)
                {
                    allowed_ip.AddressFamily = AF_INET6;
                }
                else
                {
                    return 0;
                }
            }
            memcpy(reinterpret_cast<BYTE *>(conf) + offset, &allowed_ip, allowed_ip_size);
            offset += allowed_ip_size;
        }
        return total_size;
    }

public:
    std::wstring name;
    std::unordered_map<std::wstring, WIREGUARD_PEER> peers;
    // 约定每个peer一个vlan地址
    std::unordered_map<std::wstring, std::pair<std::string, u_char>> peer_transport;

    // wireguard 适配器匿名句柄
    WIREGUARD_ADAPTER_HANDLE handle = nullptr;
    // 特定内存布局的wireguard配置
    // interface + peer1 + allowed_ip1 + allowed_ip2 + peer2 + allowed + ...
    void *conf = nullptr;

    // 设置适配器参数
    _NODISCARD bool set_config()
    {
        auto size_of_config = generate_config();
        if (size_of_config == 0)
        {
            return false;
        }
        // 设置配置
        const auto f = WireGuardSetConfiguration(handle, static_cast<WIREGUARD_INTERFACE *>(conf), size_of_config);
        if (!f)
        {
            const auto r = GetLastError();
            log_dll(WIREGUARD_LOG_ERR, 0, GetErrorMessage(r).c_str());
        }
        return f;
    }

    // 设置适配器状态
    bool adapter_state(const bool state) const
    {
        auto flag = WireGuardSetAdapterState(handle, state ? WIREGUARD_ADAPTER_STATE_UP : WIREGUARD_ADAPTER_STATE_DOWN);
        if (flag)
        {
            return true;
        }
        auto code = GetLastError();
        if (code != 0)
        {
            log_dll(WIREGUARD_LOG_ERR, 0, GetErrorMessage(code).c_str());
        }
        return false;
    }

    wireguard_adapter(const WIREGUARD_ADAPTER_HANDLE &handle, std::wstring name,
                      const u_char *public_key, const u_char *private_key,
                      const uint16_t listen_port) noexcept : name(std::move(name)), handle(handle)
    {
        memcpy(interface_config.PublicKey, public_key, WIREGUARD_KEY_LENGTH);
        memcpy(interface_config.PrivateKey, private_key, WIREGUARD_KEY_LENGTH);
        interface_config.ListenPort = listen_port;
        interface_config.PeersCount = 0;

        interface_config.Flags = WIREGUARD_INTERFACE_HAS_LISTEN_PORT | WIREGUARD_INTERFACE_HAS_PRIVATE_KEY |
                                 WIREGUARD_INTERFACE_HAS_PUBLIC_KEY;
    };

    // 添加成员
    _NODISCARD bool add_peer(const std::wstring &peer_name, const SOCKADDR_INET &endpoint, const u_char *public_key,
                             std::pair<std::string, u_char> transport_ip)
    {
        if (peers.find(peer_name) != peers.end())
        {
            log(WIREGUARD_LOG_ERR, "peer already exists");
            return false;
        }
        WIREGUARD_PEER new_peer = {};
        new_peer.Endpoint = endpoint;
        memcpy(new_peer.PublicKey, public_key, WIREGUARD_KEY_LENGTH);
        new_peer.Flags = WIREGUARD_PEER_HAS_PUBLIC_KEY | WIREGUARD_PEER_HAS_ENDPOINT;
        new_peer.AllowedIPsCount = 1;
        peers[peer_name] = new_peer;
        interface_config.PeersCount = peers.size();
        peer_transport[peer_name] = transport_ip;
        return true;
    }

    // 删除成员
    void del_peer(const std::wstring &peer_name)
    {
        peers.erase(peer_name);
        peer_transport.erase(peer_name);
        interface_config.PeersCount = peers.size();
    }

    bool run()
    {
        return set_config() && adapter_state(true);
    }

    bool close() const
    {
        return adapter_state(false);
    }

    ~wireguard_adapter()
    {
        if (handle != nullptr)
        {
            WireGuardCloseAdapter(handle);
            log_dll(WIREGUARD_LOG_INFO, 0, std::wstring(L"adapter closed: ").append(name).c_str());
        }
        free(conf);
    };
};

/**
 * 管理器单例
 */
class WireGuardHandle
{
private:
    std::unordered_map<std::wstring, std::shared_ptr<wireguard_adapter>> adapters;

    static void init()
    {
        // 初始化winsock
        WSADATA wsaData;
        if (const int iResult = WSAStartup(MAKEWORD(2, 2), &wsaData); iResult != 0)
        {
            log(WIREGUARD_LOG_ERR, "load ws2 failed");
        }
        // 加载dll
        initial();
        WireGuardSetLogger((WIREGUARD_LOGGER_CALLBACK)&log_dll);

        log(WIREGUARD_LOG_INFO, "handler created");
    }

    WireGuardHandle()
    {
        adapters = std::unordered_map<std::wstring, std::shared_ptr<wireguard_adapter>>();
    };

public:
    static WireGuardHandle instance;
    static std::once_flag initInstanceFlag;

    WireGuardHandle(const WireGuardHandle &) = delete;

    WireGuardHandle &operator=(const WireGuardHandle &) = delete;

    ~WireGuardHandle()
    {
        // 释放winsock
        WSACleanup();
        log(WIREGUARD_LOG_INFO, "handler closed");
    };

    static WireGuardHandle &getInstance()
    {
        std::call_once(WireGuardHandle::initInstanceFlag, []()
                       { init(); });
        return instance;
    };

    // 创建适配器对象，已存在则直接返回
    _NODISCARD std::shared_ptr<wireguard_adapter> create_adapter(const wchar_t *name, const u_char *public_key,
                                                                 const u_char *private_key, uint16_t listen_port)
    {
        if (adapters.find(name) != adapters.end())
        {
            return adapters[name];
        }
        auto handle = WireGuardCreateAdapter(name, L"WireGuard", nullptr);
        if (handle == nullptr)
        {
            return nullptr;
        }

        std::shared_ptr<wireguard_adapter> adapter = nullptr;

        adapter = std::make_shared<wireguard_adapter>(handle, name, public_key, private_key, listen_port);
        adapters[name] = adapter;
        return adapter;
    };

    void del_adapter(const wchar_t *name)
    {
        if (adapters.find(name) == adapters.end())
        {
            return;
        }
        adapters.erase(name);
    }

    // 添加成员并修改wireguard适配器配置
    _NODISCARD bool add_peer(const wchar_t *adapter_name, const wchar_t *peer_name, const u_char *pub_key,
                             const char *ip, uint16_t port, std::pair<std::string, u_char> transport_ip)
    {
        if (adapters.find(adapter_name) == adapters.end())
        {
            log(WIREGUARD_LOG_ERR, "adapter not exists");
            return false;
        }
        sockaddr_in addr = {};
        SOCKADDR_INET endpoint = {};
        addr.sin_family = AF_INET;
        addr.sin_port = htons(port);
        if (int result = inet_pton(AF_INET, ip, &addr.sin_addr); result != 1)
        // ip6
        {
            sockaddr_in6 addr6 = {};
            addr6.sin6_family = AF_INET6;
            addr6.sin6_port = htons(port);
            result = inet_pton(AF_INET6, ip, &addr6.sin6_addr);
            if (result != 1)
            {
                log(WIREGUARD_LOG_ERR, "ip format error");
                return false;
            }
            endpoint.Ipv6 = addr6;
            endpoint.si_family = AF_INET6;
        }
        else
        {
            endpoint.Ipv4 = addr;
            endpoint.si_family = AF_INET;
        }
        return adapters[adapter_name]->add_peer(peer_name, endpoint, pub_key, transport_ip) && adapters[adapter_name]->set_config();
    }

    bool del_peer(const wchar_t *adapter_name, const wchar_t *peer_name)
    {
        if (adapters.find(adapter_name) == adapters.end())
        {
            return false;
        }
        adapters[adapter_name]->del_peer(peer_name);
        return adapters[adapter_name]->set_config();
    }
};

std::once_flag WireGuardHandle::initInstanceFlag;
WireGuardHandle WireGuardHandle::instance;

// ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// |-------------------------- 导出函数定义 --------------------------- |
// ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

extern "C"
{
    EXPORT void set_env(char *val)
    {
        env = val;
    }
    /**
     * 设置全局日志回调
     * @param cb: 回调函数指针
     */
    EXPORT void set_logger(void(*cb)(WIREGUARD_LOGGER_LEVEL level, const char * msg))
    {
        log_func = cb;
    }

    /**
     * 创建vlan房间
     * @param name: 房间名 @param public_key: 32位uint8类型的ed25519公钥 @param private_key: 32位uint8类型的ed25519私钥 @param port: 本机转发端口
     */
    EXPORT response create_room(const wchar_t *name, const u_char *public_key, const u_char *private_key, uint16_t port)
    {
        auto &handle = WireGuardHandle::getInstance();
        if (wg == nullptr)
        {
            return {ffi_wireguard_dll_unload, L"wireguard.dll unload"};
        }
        auto ptr = handle.create_adapter(name, public_key, private_key, port);
        if (ptr == nullptr)
        {
            return {ffi_adapter_create_err, L"create adapter failed"};
        }
        if (!ptr->run())
        {
            handle.del_adapter(name);
            return {ffi_adapter_run_err, L"adapter run failed"};
        }
        return {ffi_success, L"success"};
    }

    /**
     * 删除房间
     * @param name: 房间名
     */
    EXPORT response del_room(const wchar_t *name)
    {
        auto &handle = WireGuardHandle::getInstance();
        if (wg == nullptr)
        {
            return {ffi_wireguard_dll_unload, L"wireguard.dll unload"};
        }
        handle.del_adapter(name);
        return {ffi_success, L"success"};
    }

    /**
     * 添加房间成员
     * @param adapter_name: 房间适配器名 @param peer_name: 成员名 @param ip: 成员通信IP @param port: 成员通信端口 @param public_key: 成员ed25519公钥
     * @param transport_ip: 成员虚拟局域网网转发IP @param mask: 转发IP子网掩码
     */
    EXPORT response add_peer(const wchar_t *adapter_name, const wchar_t *peer_name, const char *ip, const uint16_t port, const u_char *public_key,
                             const char *transport_ip, u_char mask)
    {
        auto &handle = WireGuardHandle::getInstance();
        if (wg == nullptr)
        {
            return {ffi_wireguard_dll_unload, L"wireguard.dll unload"};
        }
        if (!handle.add_peer(adapter_name, peer_name, public_key, ip, port, {transport_ip, mask}))
        {
            return {ffi_add_peer_err, L"add peer failed"};
        }
        return {ffi_success, L"success"};
    }

    EXPORT response del_peer(const wchar_t *adapter_name, const wchar_t *peer_name)
    {
        auto &handle = WireGuardHandle::getInstance();
        if (wg == nullptr)
        {
            return {ffi_wireguard_dll_unload, L"wireguard.dll unload"};
        }
        handle.del_peer(adapter_name, peer_name);
        return {ffi_success, L"success"};
    }
}

namespace test
{
    void __stdcall test_log(const WIREGUARD_LOGGER_LEVEL level, const char *msg)
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
        log_func = test_log;
    }

    // 测试配置是否成功，数据格式是否完整
    void check_conf(const std::shared_ptr<wireguard_adapter> &adapter)
    {
        unsigned long mem_size = 0;
        mem_size = interface_size + peer_size * adapter->peers.size() + allowed_ip_size * adapter->peers.size();
        const auto buffer = reinterpret_cast<WIREGUARD_INTERFACE *>(malloc(mem_size));
        if (!WireGuardGetConfiguration(adapter->handle, buffer, &mem_size))
        {
            const auto r = GetLastError();
            std::cout << "get configuration failed: " << r << std::endl;
            return;
        }
        if (memcmp(adapter->conf, buffer, mem_size) != 0)
        {
            std::cout << "unsame mem" << '\n';
        }

        std::cout << "interface listen port: " << buffer->ListenPort << std::endl;
        if (buffer->PeersCount != 0)
        {
            const auto peer = reinterpret_cast<WIREGUARD_PEER *>(reinterpret_cast<char *>(buffer) + 80);
            std::cout << peer->PublicKey << '\n';
        }
        free(buffer);
    }
}

int main()
{
    test::set_logger();
    auto &handle = WireGuardHandle::getInstance();
    // ed25519公私钥
    const u_char pub_key[] = {
        46, 133, 210, 14, 242, 236, 166, 218, 5, 143, 29, 91, 247, 57, 14, 20, 62, 223, 234, 131, 55, 173, 40, 15, 198, 44, 64, 90, 109, 250, 251, 219};
    const u_char pri_key[] = {
        59, 255, 166, 74, 226, 179, 173, 137, 54, 172, 48, 17, 85, 28, 2, 84, 5, 22, 21, 197, 183, 154, 115, 162, 229, 252, 213, 34, 51, 225, 47, 86};
    const auto adapter = handle.create_adapter(L"test", pub_key, pri_key, 8080);
    if (adapter == nullptr)
    {
        std::cout << "adapter create failed" << std::endl;
        return 0;
    }
    if (!adapter->run())
    {
        return 0;
    }
    test::check_conf(adapter);
    const u_char peer_key[] = {
        113, 54, 183, 51, 253, 208, 0, 141, 85, 73, 153, 40, 209, 110, 24, 169, 158, 172, 204, 231, 13, 52, 53, 46, 53,
        186, 9, 64, 182, 167, 28, 130};
    if (const auto ok = handle.add_peer(L"test", L"peer1", peer_key, "192.168.0.100", 8767, {"10.0.0.1", 24}); !ok)
    {
        return 0;
    }

    test::check_conf(adapter);
    if (!adapter->close())
    {
        log(WIREGUARD_LOG_ERR, "adapter close failed");
    }
    return 0;
}
