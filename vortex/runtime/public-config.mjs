const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function isLocalHostname(hostname) {
  return LOCAL_HOSTS.has(hostname) || hostname.endsWith(".localhost");
}

export function validateVortexPublicConfig(vortexUrlValue, sdkUrlValue) {
  if (!vortexUrlValue || !sdkUrlValue) {
    return { enabled: false };
  }

  let vortexUrl;
  let sdkUrl;

  try {
    vortexUrl = new URL(vortexUrlValue);
    sdkUrl = new URL(sdkUrlValue);
  }
  catch {
    return { enabled: false };
  }

  const local = isLocalHostname(vortexUrl.hostname);
  const safeProtocol = vortexUrl.protocol === "https:" || (local && vortexUrl.protocol === "http:");
  const safeVortexUrl =
    safeProtocol
    && !vortexUrl.username
    && !vortexUrl.password
    && vortexUrl.pathname === "/"
    && !vortexUrl.search
    && !vortexUrl.hash
  ;
  const safeSdkUrl =
    sdkUrl.origin === vortexUrl.origin
    && !sdkUrl.username
    && !sdkUrl.password
    && sdkUrl.pathname === "/sdk/v1/vortex-game-sdk.js"
    && !sdkUrl.search
    && !sdkUrl.hash
  ;

  if (!safeVortexUrl || !safeSdkUrl) {
    return { enabled: false };
  }

  return {
    enabled: true,
    vortexOrigin: vortexUrl.origin,
    sdkUrl: sdkUrl.href
  };
}

export function vortexPublicConfig(environment = process.env) {
  return validateVortexPublicConfig(
    environment.VORTEX_PUBLIC_URL,
    environment.VORTEX_SDK_URL
  );
}
