export class Token {
    public userId: number;
    public userUuid: string;
    public username: string;
    public token: string;
    public permission: string[];
    public expire: Date;
    public admin: boolean;

    constructor(token: string) {
        this.token = token;
        const ele = token.split('.')[1];
        const info : string = Buffer.from(ele, 'base64').toString('utf-8');
        const data:{userId: number, userUuid: string, username: string, permission: string[], expire: Date} = JSON.parse(info);
        this.userId = data.userId;
        this.userUuid = data.userUuid;
        this.username = data.username;
        this.permission = data.permission;
        this.expire = data.expire;
        this.admin = data.permission.includes("admin");
    }

    public check() {

    }
}