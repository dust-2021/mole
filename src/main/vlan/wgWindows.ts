import {environment, BaseDir} from "../../main/public/public";
import koffi = require("koffi");
import path from "path";

const devPath = path.join(BaseDir, '../lib/wireguard/amd64/wireguard.dll');
const proPath = path.join(process.resourcesPath, 'resources', 'wireguard', 'wireguard.dll')
console.log(devPath, __dirname);

export const wireguardDll = koffi.load(environment === 'dev' ? devPath : proPath);
