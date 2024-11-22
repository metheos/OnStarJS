interface GMAuthConfig {
    username: string;
    password: string;
    deviceId: string;
    totpKey: string;
    tokenLocation?: string;
}
interface TokenSet {
    access_token: string;
    id_token?: string;
    refresh_token?: string;
    expires_at?: number;
    expires_in?: number;
}
interface GMAPITokenResponse {
    access_token: string;
    expires_in: number;
    expires_at: number;
    token_type: string;
    scope: string;
    onstar_account_info: OnStarAccountInfo;
    user_info: UserInfo;
    id_token: string;
    expiration: number;
    upgraded: boolean;
}
interface OnStarAccountInfo {
    country_code: string;
    account_no: string;
}
interface UserInfo {
    RemoteUserId: string;
    country: string;
}
export declare class GMAuth {
    private config;
    private MSTokenPath;
    private GMTokenPath;
    private oidc;
    private jar;
    private axiosClient;
    private csrfToken;
    private transId;
    private currentGMAPIToken;
    constructor(config: GMAuthConfig);
    authenticate(): Promise<GMAPITokenResponse>;
    doFullAuthSequence(): Promise<TokenSet>;
    private saveTokens;
    private getAuthorizationCode;
    private handleMFA;
    private submitCredentials;
    static authTokenIsValid(authToken: GMAPITokenResponse): boolean;
    private loadCurrentGMAPIToken;
    private getGMAPIToken;
    private getRequest;
    private postRequest;
    private handleRequestError;
    private getRegexMatch;
    private captureRedirectLocation;
    private setupClient;
    private startAuthorizationFlow;
    private getAccessToken;
    private loadAccessToken;
}
interface AuthConfig {
    username: string | undefined;
    password: string | undefined;
    deviceId: string | undefined;
    totpKey: string | undefined;
    tokenLocation?: string | undefined;
}
export declare function getGMAPIJWT(config: AuthConfig): Promise<{
    token: GMAPITokenResponse;
    auth: GMAuth;
}>;
export {};
