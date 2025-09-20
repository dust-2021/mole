#include <unordered_map>
#include "unordered_set"
#include <string>
#include <stdexcept>
#include "wireguard.h"
#include <memory>
#include <cstring>
#include "mutex"

#include <iostream>

#include "WinSock2.h"
#include "Ws2tcpip.h"

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

static const size_t interface_size = sizeof(WIREGUARD_INTERFACE);
static const size_t peer_size = sizeof(WIREGUARD_PEER);
static const size_t allowed_ip_size = sizeof(WIREGUARD_ALLOWED_IP);

static const WIREGUARD_LOGGER_CALLBACK *log_func = nullptr;

void log(WIREGUARD_LOGGER_LEVEL level, const char *msg)
{
    if (log_func != nullptr)
    {
        (*log_func)(level, 0, std::wstring(msg, msg + strlen(msg)).c_str());
    }
}

struct response
{
    uint16_t code;
    const char *msg;
};

bool initial()
{
    wg =
        LoadLibraryExW(L"wireguard.dll", NULL, LOAD_LIBRARY_SEARCH_APPLICATION_DIR | LOAD_LIBRARY_SEARCH_SYSTEM32);
    if (!wg)
        return false;
#define X(Name) ((*(FARPROC *)&Name = GetProcAddress(wg, #Name)) == NULL)
    if (X(WireGuardCreateAdapter) || X(WireGuardOpenAdapter) || X(WireGuardCloseAdapter) ||
        X(WireGuardGetAdapterLUID) || X(WireGuardGetRunningDriverVersion) || X(WireGuardDeleteDriver) ||
        X(WireGuardSetLogger) || X(WireGuardSetAdapterLogging) || X(WireGuardGetAdapterState) ||
        X(WireGuardSetAdapterState) || X(WireGuardGetConfiguration) || X(WireGuardSetConfiguration))
#undef X
    {
        if (log_func != nullptr)
        {
            (*log_func)(WIREGUARD_LOG_ERR, 0, L"load wireguard.dll failed");
        }
        return false;
    }
    return true;
}

class wireguard_adapter : public std::enable_shared_from_this<wireguard_adapter>
{
public:
    std::string name;
    std::unordered_map<std::string, WIREGUARD_PEER> peers;
    std::unordered_map<std::string, std::unordered_set<std::string>> allowed_ips;
    WIREGUARD_INTERFACE interface_config;

    WIREGUARD_ADAPTER_HANDLE handle = nullptr;
    // 特定内存布局的wireguard配置
    // interface + peer1 + allowed_ip1 + allowed_ip2 + peer2 + allowed + ...
    void *conf = nullptr;

private:
    // 生成配置数据
    void generate_config()
    {
        size_t total_size = interface_size + peers.size() * peer_size + allowed_ips.size() * allowed_ip_size;
        auto new_ptr = realloc(conf, total_size);
        if (new_ptr == nullptr)
        {
            return;
        }
        conf = new_ptr;
        size_t offset = 0;
        // 逐步复制数据
        memcpy(conf, &this->interface_config, interface_size);
        offset += interface_size;
        for (const auto &[key, peer] : peers)
        {
            memcpy((BYTE *)conf + offset, &peer, peer_size);
            offset += peer_size;
            for (const auto &ip_str : allowed_ips[key])
            {
                WIREGUARD_ALLOWED_IP allowed_ip = {};
                int result = inet_pton(AF_INET, ip_str.c_str(), &allowed_ip.Address.V4);
                if (result == 1)
                {
                    allowed_ip.AddressFamily = AF_INET;
                }
                else
                {
                    result = inet_pton(AF_INET6, ip_str.c_str(), &allowed_ip.Address.V6);
                    if (result == 1)
                    {
                        allowed_ip.AddressFamily = AF_INET6;
                    }
                    else
                    {
                        throw std::invalid_argument("ip format error");
                    }
                }
                // 后端设定保留2段网段
                allowed_ip.Cidr = 16;
                memcpy((BYTE *)conf + offset, &allowed_ip, allowed_ip_size);
                offset += allowed_ip_size;
            }
        }
    }

public:
    wireguard_adapter(std::string name, uint16_t listen_port) : name(name)
    {
        interface_config.ListenPort = listen_port;
        interface_config.Flags = WIREGUARD_INTERFACE_HAS_LISTEN_PORT;
        generate_config();
    };
    wireguard_adapter(std::string name, const char *public_key, const char *private_key, uint16_t listen_port) : name(name)
    {
        if (strlen(public_key) != WIREGUARD_KEY_LENGTH || strlen(private_key) != WIREGUARD_KEY_LENGTH)
        {
            throw std::invalid_argument("key length error");
        }

        interface_config.ListenPort = listen_port;

        memcpy(interface_config.PublicKey, public_key, WIREGUARD_KEY_LENGTH);
        memcpy(interface_config.PrivateKey, private_key, WIREGUARD_KEY_LENGTH);
        interface_config.Flags = WIREGUARD_INTERFACE_HAS_LISTEN_PORT | WIREGUARD_INTERFACE_HAS_PRIVATE_KEY | WIREGUARD_INTERFACE_HAS_PUBLIC_KEY;
        generate_config();
    };

    void add_peer(std::string name, SOCKADDR_INET &endpoint, const char *public_key, const char *preshared_key)
    {
        if (strlen(public_key) != WIREGUARD_KEY_LENGTH || strlen(preshared_key) != WIREGUARD_KEY_LENGTH)
        {
            throw std::invalid_argument("key length error");
        }

        if (peers.find(name) != peers.end())
        {
            throw std::invalid_argument("peer already exists");
        }
        WIREGUARD_PEER peer = {};
        peer.Endpoint = endpoint;
        memcpy(peer.PublicKey, public_key, WIREGUARD_KEY_LENGTH);
        memcpy(peer.PresharedKey, preshared_key, WIREGUARD_KEY_LENGTH);
        peer.Flags = WIREGUARD_PEER_HAS_PUBLIC_KEY | WIREGUARD_PEER_HAS_PRESHARED_KEY | WIREGUARD_PEER_HAS_ENDPOINT;
        peers[name] = peer;

        allowed_ips[name] = std::unordered_set<std::string>{};
        generate_config();
    }

    void del_peer(std::string name)
    {
        peers.erase(name);
        allowed_ips.erase(name);
        generate_config();
    }

    void add_allowed_ip(std::string peer_name, std::string ip)
    {
        if (peers.find(peer_name) == peers.end())
        {
            throw std::invalid_argument("peer not exists");
        }
        allowed_ips[peer_name].insert(ip);
        peers[peer_name].AllowedIPsCount = allowed_ips[peer_name].size();
        generate_config();
    }

    void del_allowed_ip(std::string peer_name, std::string ip)
    {
        if (peers.find(peer_name) == peers.end())
        {
            throw std::invalid_argument("peer not exists");
        }
        allowed_ips[peer_name].erase(ip);
        peers[peer_name].AllowedIPsCount = allowed_ips[peer_name].size();
        generate_config();
    }

    ~wireguard_adapter()
    {
        free(conf);
    };
};

class WireGuardHandle
{
private:
    static WireGuardHandle *instance;
    static std::once_flag initInstanceFlag;
    std::unordered_map<std::wstring, std::shared_ptr<wireguard_adapter>> adapters;

    WireGuardHandle() {
    };

public:
    WireGuardHandle(const WireGuardHandle &) = delete;
    WireGuardHandle &operator=(const WireGuardHandle &) = delete;

    static WireGuardHandle *getInstance()
    {
        std::call_once(initInstanceFlag, []()
                       { instance = new WireGuardHandle(); });
        return instance;
    };

    auto create_adapter(const wchar_t *name, const char *public_key, const char *private_key, uint16_t listen_port)
    {
        auto cpp_name = std::wstring(name, name + wcslen(name));
        if (adapters.find(cpp_name) != adapters.end())
        {
            return std::shared_ptr<wireguard_adapter>(nullptr);
        }
        auto handle = WireGuardCreateAdapter(name, L"WireGuard", NULL);
        std::shared_ptr<wireguard_adapter> adapter = nullptr;
        if (strlen(public_key) != WIREGUARD_KEY_LENGTH || strlen(private_key) != WIREGUARD_KEY_LENGTH)
        {
            adapter = std::make_shared<wireguard_adapter>(name, listen_port);
        }
        else
        {
            adapter = std::make_shared<wireguard_adapter>(name, public_key, private_key, listen_port);
        }
        adapters[cpp_name] = adapter;
        return adapter;
    };

    void del_adapter(const wchar_t *name)
    {
        adapters.erase(name);
    }
};

// ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// |-------------------------- 导出函数定义 -------------------------- |
// ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

extern "C"
{

    EXPORT response check_wg()
    {
        if (!initial())
        {
            return {1, "load wireguard.dll failed"};
        }
        auto get_version = WireGuardGetRunningDriverVersion();
        if (get_version == 0)
        {
            return {2, "wireguard driver not running"};
        }
        return {0, "success"};
    }

    EXPORT response set_logger(WIREGUARD_LOGGER_CALLBACK *cb)
    {
        if (wg == nullptr)
        {
            return {1, "load wireguard.dll failed"};
        }
        log_func = cb;
        WireGuardSetLogger(*cb);
        return {0, "success"};
    }

    EXPORT response create_adapter(const wchar_t *name, const char *public_key, const char *private_key, unsigned short listen_port)
    {
        if (wg == nullptr)
        {
            return {1, "load wireguard.dll failed"};
        }
        auto h = WireGuardHandle::getInstance();
        if (h->create_adapter(name, public_key, private_key, listen_port) == nullptr)
        {
            return {2, "adapter already exists"};
        }
        return {0, "success"};
    }

    EXPORT response delete_adapter(const wchar_t *name)
    {
        if (wg == nullptr)
        {
            return {1, "load wireguard.dll failed"};
        }
        auto h = WireGuardHandle::getInstance();
        h->del_adapter(name);
        return {0, "success"};
    }
}

int main()
{
    auto r = create_adapter(L"test", "abcdefghijklmnopqrstuvwxyzabcdef", "abcdefghijklmnopqrstuvwxyzabcdef", 51820);
    std::cout << r.code << " " << r.msg << std::endl;
    return 0;
}