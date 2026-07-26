const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

// The repository also contains two Next.js sites. Their generated `.next`
// directories change independently and must not be watched by the mobile
// bundler (a removed Next export directory previously crashed Metro).
config.resolver.blockList = [
  /[\\/]admin-web[\\/].*/,
  /[\\/]public-web[\\/].*/,
]

module.exports = config
