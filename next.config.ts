import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

// 같은 와이파이의 휴대폰에서 dev 서버에 접속할 수 있게 현재 사설 IP를 허용한다.
// dev 서버에만 적용되고 배포 빌드에는 영향이 없다.
const lanAddresses = Object.values(networkInterfaces())
  .flat()
  .filter((a) => a && a.family === "IPv4" && !a.internal)
  .map((a) => a!.address);

const nextConfig: NextConfig = {
  allowedDevOrigins: lanAddresses,
};

export default nextConfig;
