# Configura npm para registry oficial (aaPanel costuma usar npmmirror → timeout)
prepare_npm() {
  export NPM_CONFIG_REGISTRY="${NPM_CONFIG_REGISTRY:-https://registry.npmjs.org/}"
  export NPM_CONFIG_FETCH_TIMEOUT="${NPM_CONFIG_FETCH_TIMEOUT:-300000}"
  export NPM_CONFIG_FETCH_RETRIES="${NPM_CONFIG_FETCH_RETRIES:-5}"
  export NPM_CONFIG_FETCH_RETRY_MINTIMEOUT="${NPM_CONFIG_FETCH_RETRY_MINTIMEOUT:-20000}"
  export NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT="${NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT:-120000}"

  local global_reg
  global_reg="$(npm config get registry --global 2>/dev/null || true)"
  if echo "$global_reg" | grep -qi 'npmmirror'; then
    echo "AVISO: npm global usa npmmirror — instalando via registry.npmjs.org (.npmrc do projeto)"
  fi
}

npm_ci_safe() {
  prepare_npm
  local dir="${1:-.}"
  if [ "$dir" = "." ]; then
    rm -rf node_modules 2>/dev/null || true
    npm ci --registry=https://registry.npmjs.org/
  else
    rm -rf "${dir}/node_modules" 2>/dev/null || true
    npm ci --prefix "$dir" --registry=https://registry.npmjs.org/
  fi
}
