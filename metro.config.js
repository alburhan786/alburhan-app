const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

config.resolver = config.resolver || {};
config.resolver.blockList = [
  /\.local\/.*/,
  /\.local\/state\/.*/,
  /\.local\/skills\/.*/,
];

config.watchFolders = (config.watchFolders || []).filter(
  (folder) => !folder.includes(".local")
);

module.exports = config;
