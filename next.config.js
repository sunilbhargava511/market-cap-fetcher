/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    EODHD_API_TOKEN: process.env.EODHD_API_TOKEN,
  }
}

module.exports = nextConfig
