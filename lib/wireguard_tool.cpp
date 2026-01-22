#include "string"
#include "sstream"
#include "src/wireguard.h"
#include "filesystem"

#include "winsock2.h"
#include "ws2tcpip.h"
#include "iphlpapi.h"

#pragma once
#pragma comment(lib, "iphlpapi.lib")

namespace fs = std::filesystem;

static constexpr size_t interface_size = sizeof(WIREGUARD_INTERFACE);
static constexpr size_t peer_size = sizeof(WIREGUARD_PEER);
static constexpr size_t allowed_ip_size = sizeof(WIREGUARD_ALLOWED_IP);
static const uint8_t MASK = 16;

// 外部日志函数钩子
static void (*log_func)(WIREGUARD_LOGGER_LEVEL level, const char *msg) = nullptr;

// 用于wireguard日志回调转换
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

struct response
{
    int code;
    const wchar_t *msg;
};

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

bool parse_ip(const char *ip_string, int port, SOCKADDR_INET &addr)
{   
    memset(&addr, 0, sizeof(addr));
    if (inet_pton(AF_INET, ip_string, &addr.Ipv4.sin_addr) == 1)
    {
        addr.Ipv4.sin_port = htons(port);
        addr.si_family = AF_INET;
        return true;
    }
    if (inet_pton(AF_INET6, ip_string, &addr.Ipv6.sin6_addr) == 1)
    {
        addr.Ipv6.sin6_port = htons(port);
        addr.si_family = AF_INET6;
        return true;
    }
    return false;
}

bool parse_allowed_ip(std::string &ip_string, WIREGUARD_ALLOWED_IP &rec)
{
    size_t slash_pos = ip_string.find('/');
    std::string cidr_part;
    if (slash_pos != std::string::npos)
    {
        cidr_part = ip_string.substr(slash_pos + 1);
        ip_string = ip_string.substr(0, slash_pos);
        try
        {
            rec.Cidr = static_cast<BYTE>(std::stoi(cidr_part));
        }
        catch (const std::exception &e)
        {
            log(WIREGUARD_LOG_ERR, "cidr format error");
            return false;
        }
    }
    // 解析IP地址
    if (inet_pton(AF_INET, ip_string.c_str(), &rec.Address.V4) == 1)
    {
        rec.AddressFamily = AF_INET;
        if (cidr_part.empty())
            rec.Cidr = 32;
    }
    else if (inet_pton(AF_INET6, ip_string.c_str(), &rec.Address.V6) == 1)
    {
        rec.AddressFamily = AF_INET6;
        if (cidr_part.empty())
            rec.Cidr = 128;
    }
    else
    {
        log(WIREGUARD_LOG_ERR, "ip format error");
        return false;
    }
    return true;
}

// 配置虚拟网卡ip
bool set_adapter_ip(DWORD interfaceIndex, const char *ipAddress, const char *netmask)
{
    MIB_UNICASTIPADDRESS_ROW ipRow;
    InitializeUnicastIpAddressEntry(&ipRow);

    ipRow.InterfaceIndex = interfaceIndex;
    ipRow.Address.si_family = AF_INET;
    inet_pton(AF_INET, ipAddress, &ipRow.Address.Ipv4.sin_addr);
    ipRow.OnLinkPrefixLength = MASK;

    // 设置为手动配置（不是 DHCP）
    ipRow.DadState = IpDadStatePreferred;
    ipRow.ValidLifetime = 0xffffffff; // 永久有效
    ipRow.PreferredLifetime = 0xffffffff;
    ipRow.PrefixOrigin = IpPrefixOriginManual;
    ipRow.SuffixOrigin = IpSuffixOriginManual;

    DWORD result = CreateUnicastIpAddressEntry(&ipRow);
    return result == NO_ERROR;
}

// 添加虚拟网卡路由
bool add_adapter_route(const NET_LUID &luid, DWORD interface_index, const char *destNetwork, BYTE prefixLength)
{
    MIB_IPFORWARD_ROW2 route;
    InitializeIpForwardEntry(&route);

    route.InterfaceLuid = luid;
    route.InterfaceIndex = interface_index;
    route.DestinationPrefix.Prefix.si_family = AF_INET;
    if (inet_pton(AF_INET, destNetwork, &route.DestinationPrefix.Prefix.Ipv4.sin_addr) != 1)
        return false;
    route.DestinationPrefix.PrefixLength = prefixLength;

    route.NextHop.si_family = AF_INET;
    route.NextHop.Ipv4.sin_addr.s_addr = INADDR_ANY;

    route.Metric = 1;
    route.Protocol = MIB_IPPROTO_NETMGMT;
    route.ValidLifetime = 0xffffffff;
    route.PreferredLifetime = 0xffffffff;

    DWORD result = CreateIpForwardEntry2(&route);
    return result == NO_ERROR || result == ERROR_OBJECT_ALREADY_EXISTS;
}

bool bind_adapter(WIREGUARD_ADAPTER_HANDLE handle, const char *ip, const char * ip_area)
{
    NET_LUID luid;
    WireGuardGetAdapterLUID(handle, &luid);
    DWORD interface_index;
    ConvertInterfaceLuidToIndex(&luid, &interface_index);
    if (!set_adapter_ip(interface_index, ip, "255.255.0.0"))
    {
        log(WIREGUARD_LOG_ERR, "set adapter ip failed");
        return false;
    }
    if (!add_adapter_route(luid, interface_index, ip_area, MASK))
    {
        log(WIREGUARD_LOG_ERR, "set adapter route failed");
        return false;
    }
    return true;
}

namespace formmater
{
    // byte密钥转b64字符串
    std::string base64_encode(const uint8_t *data, size_t len)
    {
        static const char *base64_chars =
            "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
            "abcdefghijklmnopqrstuvwxyz"
            "0123456789+/";

        std::string ret;
        int i = 0;
        uint8_t char_array_3[3];
        uint8_t char_array_4[4];

        while (len--)
        {
            char_array_3[i++] = *(data++);
            if (i == 3)
            {
                char_array_4[0] = (char_array_3[0] & 0xfc) >> 2;
                char_array_4[1] = ((char_array_3[0] & 0x03) << 4) + ((char_array_3[1] & 0xf0) >> 4);
                char_array_4[2] = ((char_array_3[1] & 0x0f) << 2) + ((char_array_3[2] & 0xc0) >> 6);
                char_array_4[3] = char_array_3[2] & 0x3f;

                for (i = 0; i < 4; i++)
                    ret += base64_chars[char_array_4[i]];
                i = 0;
            }
        }

        if (i)
        {
            for (int j = i; j < 3; j++)
                char_array_3[j] = '\0';

            char_array_4[0] = (char_array_3[0] & 0xfc) >> 2;
            char_array_4[1] = ((char_array_3[0] & 0x03) << 4) + ((char_array_3[1] & 0xf0) >> 4);
            char_array_4[2] = ((char_array_3[1] & 0x0f) << 2) + ((char_array_3[2] & 0xc0) >> 6);

            for (int j = 0; j < i + 1; j++)
                ret += base64_chars[char_array_4[j]];

            while (i++ < 3)
                ret += '=';
        }

        return ret;
    }

    // 将 sockaddr 转换为字符串
    std::string sockaddr_to_string(const SOCKADDR_INET *addr)
    {
        if (!addr)
            return "none";

        char ip_str[INET6_ADDRSTRLEN] = {0};
        uint16_t port = 0;

        if (addr->si_family == AF_INET)
        {
            inet_ntop(AF_INET, &addr->Ipv4.sin_addr, ip_str, sizeof(ip_str));
            port = ntohs(addr->Ipv4.sin_port);
            return std::string(ip_str) + ":" + std::to_string(port);
        }
        else if (addr->si_family == AF_INET6)
        {
            inet_ntop(AF_INET6, &addr->Ipv6.sin6_addr, ip_str, sizeof(ip_str));
            port = ntohs(addr->Ipv6.sin6_port);
            return "[" + std::string(ip_str) + "]:" + std::to_string(port);
        }

        return "unknown";
    }

    // 辅助函数：格式化允许的 IP 列表
    std::string format_allowed_ips(const WIREGUARD_ALLOWED_IP *allowed_ips, size_t count)
    {
        if (!allowed_ips || count == 0)
            return "  AllowedIPs = (none)\n";

        std::stringstream ss;
        ss << "  AllowedIPs = ";

        for (size_t i = 0; i < count; ++i)
        {
            char ip_str[INET6_ADDRSTRLEN] = {0};

            if (allowed_ips[i].AddressFamily == AF_INET)
            {
                inet_ntop(AF_INET, &allowed_ips[i].Address.V4, ip_str, sizeof(ip_str));
                ss << ip_str << "/" << (int)allowed_ips[i].Cidr;
            }
            else if (allowed_ips[i].AddressFamily == AF_INET6)
            {
                inet_ntop(AF_INET6, &allowed_ips[i].Address.V6, ip_str, sizeof(ip_str));
                ss << ip_str << "/" << (int)allowed_ips[i].Cidr;
            }

            if (i < count - 1)
                ss << ", ";
        }
        ss << "\n";

        return ss.str();
    }

    // 主函数：将 WIREGUARD_INTERFACE 转换为字符串
    std::string wireguard_config_to_string(const WIREGUARD_INTERFACE *config)
    {
        if (!config)
            return "Error: NULL configuration\n";

        std::stringstream ss;
        size_t cursor = 0;

        // Interface 部分
        ss << "[Interface]\n";

        // Private Key
        if (config->Flags & WIREGUARD_INTERFACE_HAS_PRIVATE_KEY)
        {
            ss << "PrivateKey = " << base64_encode(config->PrivateKey, 32) << "\n";
        }

        // Public Key
        if (config->Flags & WIREGUARD_INTERFACE_HAS_PUBLIC_KEY)
        {
            ss << "PublicKey = " << base64_encode(config->PublicKey, 32) << "\n";
        }

        // Listen Port
        if (config->Flags & WIREGUARD_INTERFACE_HAS_LISTEN_PORT)
        {
            ss << "ListenPort = " << config->ListenPort << "\n";
        }

        ss << "\n";
        cursor += interface_size;

        // Peers 部分
        if (config->PeersCount > 0)
        {
            const WIREGUARD_PEER *peer = reinterpret_cast<WIREGUARD_PEER *>((byte *)config + cursor);
            cursor += peer_size;

            for (DWORD i = 0; i < config->PeersCount; ++i)
            {
                ss << "[Peer #" << (i + 1) << "]\n";

                // Public Key
                if (peer->Flags & WIREGUARD_PEER_HAS_PUBLIC_KEY)
                {
                    ss << "  PublicKey = " << base64_encode(peer->PublicKey, 32) << "\n";
                }

                // Preshared Key
                if (peer->Flags & WIREGUARD_PEER_HAS_PRESHARED_KEY)
                {
                    // 检查是否为全零（未设置）
                    bool has_psk = false;
                    for (int j = 0; j < 32; ++j)
                    {
                        if (peer->PresharedKey[j] != 0)
                        {
                            has_psk = true;
                            break;
                        }
                    }
                    if (has_psk)
                    {
                        ss << "  PresharedKey = " << base64_encode(peer->PresharedKey, 32) << "\n";
                    }
                }

                // Endpoint
                if (peer->Flags & WIREGUARD_PEER_HAS_ENDPOINT)
                {
                    ss << "  Endpoint = " << sockaddr_to_string(&peer->Endpoint) << "\n";
                }

                // Persistent Keepalive
                if (peer->Flags & WIREGUARD_PEER_HAS_PERSISTENT_KEEPALIVE)
                {
                    ss << "  PersistentKeepalive = " << peer->PersistentKeepalive << "\n";
                }

                // Allowed IPs
                ss << format_allowed_ips((WIREGUARD_ALLOWED_IP *)((byte *)config + cursor), peer->AllowedIPsCount);
                cursor += peer->AllowedIPsCount * allowed_ip_size;
                // 传输统计
                ss << "  TxBytes = " << peer->TxBytes << "\n";
                ss << "  RxBytes = " << peer->RxBytes << "\n";

                // 最后握手时间
                if (peer->LastHandshake != 0)
                {
                    FILETIME ft;
                    ft.dwLowDateTime = (DWORD)(peer->LastHandshake & 0xFFFFFFFF);
                    ft.dwHighDateTime = (DWORD)(peer->LastHandshake >> 32);

                    SYSTEMTIME st;
                    FileTimeToSystemTime(&ft, &st);

                    ss << "  LastHandshake = "
                       << std::setfill('0') << std::setw(4) << st.wYear << "-"
                       << std::setw(2) << st.wMonth << "-"
                       << std::setw(2) << st.wDay << " "
                       << std::setw(2) << st.wHour << ":"
                       << std::setw(2) << st.wMinute << ":"
                       << std::setw(2) << st.wSecond << "\n";
                }
                else
                {
                    ss << "  LastHandshake = never\n";
                }

                ss << "\n";
            }
        }
        else
        {
            ss << "(No peers configured)\n";
        }

        return ss.str();
    }
}

std::string get_wg_conf(WIREGUARD_ADAPTER_HANDLE handle) {
    DWORD conf_size = 0;
    WireGuardGetConfiguration(handle, nullptr, &conf_size);
    if(conf_size == 0) return "None";
    auto buffer = (WIREGUARD_INTERFACE*)malloc(conf_size);
    WireGuardGetConfiguration(handle, buffer, &conf_size);
    auto result = formmater::wireguard_config_to_string(buffer);
    free(buffer);
    return result;
}