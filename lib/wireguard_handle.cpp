#include <unordered_map>
#include "unordered_set"
#include <string>
#include <stdexcept>
#include "src/wireguard.h"
#include <memory>
#include "mutex"

#include <iostream>
#include <utility>

#include "winsock2.h"
#include "ws2tcpip.h"

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
static WIREGUARD_LOGGER_CALLBACK log_func = nullptr;

void log(const WIREGUARD_LOGGER_LEVEL level, const char *msg) {
    if (log_func != nullptr) {
        (*log_func)(level, 0, std::wstring(msg, msg + strlen(msg)).c_str());
    }
}

void log(const WIREGUARD_LOGGER_LEVEL level, const wchar_t *msg) {
    if (log_func != nullptr) {
        (*log_func)(level, 0, msg);
    } else {
        std::wcout << level << msg << std::endl;
    }
}

std::wstring GetErrorMessage(const DWORD errorCode) {
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
    if (size) {
        msgW = std::wstring(msgBuffer, size);
    } else {
        msgW = L"Unknown error code: " + std::to_wstring(errorCode);
    }
    free(msgBuffer);
    return msgW;
}

struct response {
    uint16_t code;
    const char *msg;
};

// 加载wireguard动态库
void initial() {
    wg =
            LoadLibraryExW(L"./src/wireguard.dll", nullptr,
                           LOAD_LIBRARY_SEARCH_APPLICATION_DIR | LOAD_LIBRARY_SEARCH_SYSTEM32);
    if (!wg)
        return;
#define X(Name) ((*(FARPROC *)&Name = GetProcAddress(wg, #Name)) == NULL)
    if (X(WireGuardCreateAdapter) || X(WireGuardOpenAdapter) || X(WireGuardCloseAdapter) ||
        X(WireGuardGetAdapterLUID) || X(WireGuardGetRunningDriverVersion) || X(WireGuardDeleteDriver) ||
        X(WireGuardSetLogger) || X(WireGuardSetAdapterLogging) || X(WireGuardGetAdapterState) ||
        X(WireGuardSetAdapterState) || X(WireGuardGetConfiguration) || X(WireGuardSetConfiguration))
#undef X
    {
        log(WIREGUARD_LOG_ERR, "load wireguard.dll failed");
        return;
    }
    log(WIREGUARD_LOG_INFO, "load wireguard.dll success");
}

class wireguard_adapter : public std::enable_shared_from_this<wireguard_adapter> {
public:
    std::wstring name;
    std::unordered_map<std::wstring, WIREGUARD_PEER> peers;
    std::unordered_map<std::wstring, std::unordered_set<std::string> > allowed_ips;
    WIREGUARD_INTERFACE interface_config{};

    // wireguard 适配器匿名句柄
    WIREGUARD_ADAPTER_HANDLE handle = nullptr;
    // 特定内存布局的wireguard配置
    // interface + peer1 + allowed_ip1 + allowed_ip2 + peer2 + allowed + ...
    void *conf = nullptr;

    // 生成配置数据
    _NODISCARD bool generate_config() {
        const size_t total_size = interface_size + peers.size() * peer_size + allowed_ips.size() * allowed_ip_size;
        const auto new_ptr = realloc(conf, total_size);
        if (new_ptr == nullptr) {
            return false;
        }
        conf = new_ptr;
        size_t offset = 0;
        // 逐步复制数据
        memcpy(conf, &this->interface_config, interface_size);
        offset += interface_size;
        for (const auto &[key, peer]: peers) {
            memcpy(static_cast<BYTE *>(conf) + offset, &peer, peer_size);
            offset += peer_size;
            for (const auto &ip_str: allowed_ips[key]) {
                WIREGUARD_ALLOWED_IP allowed_ip = {};
                if (int result = inet_pton(AF_INET, ip_str.c_str(), &allowed_ip.Address.V4); result == 1) {
                    allowed_ip.AddressFamily = AF_INET;
                } else
                // TODO ipv6是否必要
                {
                    result = inet_pton(AF_INET6, ip_str.c_str(), &allowed_ip.Address.V6);
                    if (result == 1) {
                        allowed_ip.AddressFamily = AF_INET6;
                    } else {
                        throw std::invalid_argument("ip format error");
                    }
                }
                memcpy(static_cast<BYTE *>(conf) + offset, &allowed_ip, allowed_ip_size);
                offset += allowed_ip_size;
            }
        }
        return true;
    }

    // 设置适配器参数
    _NODISCARD bool set_config() {
        if (!generate_config()) {
            return false;
        }
        const size_t total_size = interface_size + peers.size() * peer_size + allowed_ips.size() * allowed_ip_size;
        // 设置配置
        const auto f = WireGuardSetConfiguration(handle, static_cast<WIREGUARD_INTERFACE *>(conf), total_size);
        if (!f) {
            const auto r = GetLastError();
            log(WIREGUARD_LOG_ERR, GetErrorMessage(r).c_str());
        }
        return f;
    }

    // 设置适配器状态
    bool adapter_state(const bool state) const {
        return WireGuardSetAdapterState(handle, state ? WIREGUARD_ADAPTER_STATE_UP : WIREGUARD_ADAPTER_STATE_DOWN);
    }

    wireguard_adapter(const WIREGUARD_ADAPTER_HANDLE &handle, std::wstring name,
                      const u_char *public_key, const u_char *private_key,
                      const uint16_t listen_port) noexcept : name(std::move(name)), handle(handle) {
        memcpy(interface_config.PublicKey, public_key, WIREGUARD_KEY_LENGTH);
        memcpy(interface_config.PrivateKey, private_key, WIREGUARD_KEY_LENGTH);
        interface_config.ListenPort = listen_port;
        interface_config.PeersCount = 0;

        interface_config.Flags = WIREGUARD_INTERFACE_HAS_LISTEN_PORT | WIREGUARD_INTERFACE_HAS_PRIVATE_KEY |
                                 WIREGUARD_INTERFACE_HAS_PUBLIC_KEY;
    };

    // 添加成员
    _NODISCARD bool add_peer(const std::wstring &peer_name, const SOCKADDR_INET &endpoint, const u_char *public_key) {
        if (peers.find(peer_name) != peers.end()) {
            log(WIREGUARD_LOG_ERR, "peer already exists");
            return false;
        }
        WIREGUARD_PEER peer = {};
        peer.Endpoint = endpoint;
        memcpy(peer.PublicKey, public_key, WIREGUARD_KEY_LENGTH);
        peer.Flags = WIREGUARD_PEER_HAS_PUBLIC_KEY | WIREGUARD_PEER_HAS_ENDPOINT;
        peers[peer_name] = peer;
        interface_config.PeersCount = peers.size();

        allowed_ips[peer_name] = std::unordered_set<std::string>{};
        return true;
    }

    // 删除成员
    void del_peer(const std::wstring &peer_name) {
        peers.erase(peer_name);
        allowed_ips.erase(peer_name);
        interface_config.PeersCount = peers.size();
    }

    // 添加成员允许的IP地址
    void add_allowed_ip(const std::wstring &peer_name, const std::string &ip) {
        if (peers.find(peer_name) == peers.end()) {
            log(WIREGUARD_LOG_ERR, "peer not exists");
            return;
        }
        allowed_ips[peer_name].insert(ip);
        peers[peer_name].AllowedIPsCount = allowed_ips[peer_name].size();
    }

    void del_allowed_ip(const std::wstring &peer_name, const std::string &ip) {
        if (peers.find(peer_name) == peers.end()) {
            log(WIREGUARD_LOG_ERR, "peer not exists");
            return;
        }
        allowed_ips[peer_name].erase(ip);
        peers[peer_name].AllowedIPsCount = allowed_ips[peer_name].size();
    }

    bool run() {
        return set_config() && adapter_state(true);
    }

    bool close() const {
        return adapter_state(false);
    }

    ~wireguard_adapter() {
        if (handle != nullptr) {
            WireGuardCloseAdapter(handle);
        }
        free(conf);
    };
};

// 静态单例，负责管理adapter，peer和winsock
class WireGuardHandle {
private:
    std::unordered_map<std::wstring, std::shared_ptr<wireguard_adapter> > adapters;

    WireGuardHandle() {
        // 初始化winsock
        WSADATA wsaData;
        if (const int iResult = WSAStartup(MAKEWORD(2, 2), &wsaData); iResult != 0) {
            log(WIREGUARD_LOG_ERR, "load ws2 failed");
        }
        // 加载dll
        initial();
        log(WIREGUARD_LOG_INFO, "handler created");
    };

public:
    static WireGuardHandle instance;
    static std::once_flag initInstanceFlag;

    WireGuardHandle(const WireGuardHandle &) = delete;

    WireGuardHandle &operator=(const WireGuardHandle &) = delete;

    ~WireGuardHandle() {
        // 释放winsock
        WSACleanup();
        log(WIREGUARD_LOG_INFO, "handler closed");
    };

    static WireGuardHandle &getInstance() {
        return instance;
    };

    // 创建适配器对象
    _NODISCARD std::shared_ptr<wireguard_adapter> create_adapter(const wchar_t *name, const u_char *public_key,
                                                                 const u_char *private_key, uint16_t listen_port) {
        if (adapters.find(name) != adapters.end()) {
            return {nullptr};
        }
        auto handle = WireGuardCreateAdapter(name, L"WireGuard", nullptr);
        if (handle == nullptr) {
            return nullptr;
        }

        std::shared_ptr<wireguard_adapter> adapter = nullptr;
        try {
            adapter = std::make_shared<wireguard_adapter>(handle, name, public_key, private_key, listen_port);
            if (!adapter->run()) {
                return nullptr;
            }
            adapters[name] = adapter;
            return adapter;
        } catch (const std::exception &e) {
            log(WIREGUARD_LOG_ERR, e.what());
            return nullptr;
        }
    };

    void del_adapter(const wchar_t *name) {
        if (adapters.find(name) == adapters.end()) {
            return;
        }
        adapters.erase(name);
    }

    // 添加成员并修改wireguard适配器配置
    _NODISCARD bool add_peer(const wchar_t *adapter_name, const wchar_t *peer_name, const u_char *pub_key,
                             const char *ip,
                             uint16_t port) {
        if (adapters.find(adapter_name) == adapters.end()) {
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
            if (result != 1) {
                log(WIREGUARD_LOG_ERR, "ip format error");
                return false;
            }
            endpoint.Ipv6 = addr6;
            endpoint.si_family = AF_INET6;
        } else {
            endpoint.Ipv4 = addr;
            endpoint.si_family = AF_INET;
        }
        return adapters[adapter_name]->add_peer(peer_name, endpoint, pub_key) && adapters[adapter_name]->set_config();
    }

    _NODISCARD bool del_peer(const wchar_t *adapter_name, const wchar_t *peer_name) {
        if (adapters.find(adapter_name) == adapters.end()) {
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

extern "C" {
EXPORT response set_logger(const WIREGUARD_LOGGER_CALLBACK &cb) {
    if (wg == nullptr) {
        return {1, "wireguard.dll unloaded"};
    }
    log_func = cb;
    WireGuardSetLogger(cb);
    return {0, "success"};
}

EXPORT response create_room(const wchar_t *name, const u_char *public_key, const u_char *private_key,
                            const unsigned short listen_port) {
    if (wg == nullptr) {
        return {1, "wireguard.dll unloaded"};
    }
    if (auto &h = WireGuardHandle::getInstance();
        h.create_adapter(name, public_key, private_key, listen_port) == nullptr) {
        return {2, "adapter already exists"};
    }
    return {0, "success"};
}

EXPORT response close_room(const wchar_t *name) {
    if (wg == nullptr) {
        return {1, "load wireguard.dll failed"};
    }
    auto &h = WireGuardHandle::getInstance();
    h.del_adapter(name);
    return {0, "success"};
}

EXPORT response add_mate(const wchar_t *room_name, const wchar_t *mate_name, const u_char *public_key,
                         const char *endpoint_ip, const unsigned short endpoint_port) {
    if (wg == nullptr) {
        return {1, "load wireguard.dll failed"};
    }

    if (auto &h = WireGuardHandle::getInstance();
        h.add_peer(room_name, mate_name, public_key, endpoint_ip, endpoint_port)) {
        return {0, "success"};
    }
    return {2, "add mate failed"};
}

EXPORT response del_mate(const wchar_t *room_name, const wchar_t *mate_name) {
    if (wg == nullptr) {
        return {1, "load wireguard.dll failed"};
    }
    auto &h = WireGuardHandle::getInstance();
    try {
        if (h.del_peer(room_name, mate_name)) {
            return {0, "success"};
        }
        return {1, "delete mate failed"};
    } catch (const std::invalid_argument &e) {
        return {3, e.what()};
    }
}
}

namespace test {
    void __stdcall test_log(const WIREGUARD_LOGGER_LEVEL level, int64_t dt, const wchar_t *msg) {
        std::wcout << dt << "code:" << level << ',' << msg << '\n';
    }

    void set_logger() {
        log_func = reinterpret_cast<WIREGUARD_LOGGER_CALLBACK>(test_log);
        WireGuardSetLogger(log_func);
    }

    // 测试配置是否成功，数据格式是否完整
    void check_conf(const std::shared_ptr<wireguard_adapter> &adapter) {
        unsigned long mem_size = 0;
        mem_size = interface_size + (peer_size * adapter->peers.size());
        for (const auto &[key, ips]: adapter->allowed_ips) {
            mem_size += allowed_ip_size * ips.size();
        }
        const auto buffer = static_cast<WIREGUARD_INTERFACE *>(malloc(mem_size));
        if (!WireGuardGetConfiguration(adapter->handle, buffer, &mem_size)) {
            const auto r = GetLastError();
            std::cout << "get configuration failed: " << r << std::endl;
            return;
        }

        std::cout << "interface listen port: " << buffer->ListenPort << std::endl;
        if (buffer->PeersCount != 0) {
            const auto peer = reinterpret_cast<WIREGUARD_PEER *>(reinterpret_cast<char *>(buffer) + 80);
            std::cout << peer->PublicKey << '\n';
        }
        free(buffer);
    }
}

int main() {
    test::set_logger();
    auto &handle = WireGuardHandle::getInstance();
    // ed25519公私钥
    const u_char pub_key[] = {
        113, 54, 183, 51, 253, 208, 0, 141, 85, 73, 153, 40, 209, 110, 24, 169, 158, 172, 204, 231, 13, 52, 53, 46, 53,
        186, 9, 64, 182, 167, 28, 130
    };
    const u_char pri_key[] = {
        88, 40, 121, 89, 221, 14, 114, 96, 3, 117, 14, 123, 88, 74, 19, 144, 154, 84, 219, 59, 244, 101, 126, 218, 91,
        64, 18, 56, 177, 249, 80, 251
    };
    const auto adapter = handle.create_adapter(L"test", pub_key, pri_key, 8080);
    if (adapter == nullptr) {
        std::cout << "adapter create failed" << std::endl;
        return 0;
    }
    if (!adapter->run()) {
        return 0;
    }
    const u_char peer_key[] = {
        113, 54, 183, 51, 253, 208, 0, 141, 85, 73, 153, 40, 209, 110, 24, 169, 158, 172, 204, 231, 13, 52, 53, 46, 53,
        186, 9, 64, 182, 167, 28, 130
    };
    if (const auto ok = handle.add_peer(L"test", L"peer1", peer_key, "192.168.0.100", 8767); !
        ok) {
        return 0;
    }

    test::check_conf(adapter);
    if (!adapter->close()) {
        log(WIREGUARD_LOG_ERR, "adapter close failed");
    }
    return 0;
}
