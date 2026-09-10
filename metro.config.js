// Config Metro extendida desde el default de Expo.
// Variante de medición (PLAN-PERFORMANCE §19): con EXPO_PUBLIC_PERF_PROFILING=1
// se resuelve react-dom al bundle con profiling de React, que habilita la
// instrumentación del <Profiler> en producción y con ello el timer
// `render.board` (duración de renders). Introduce overhead: es una variante
// de medición, NO un build de producción representativo del UX real.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

if (process.env.EXPO_PUBLIC_PERF_PROFILING === '1') {
  const originalResolveRequest = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    // Solo entornos client: en los bundles de server (SSG/SSR, environment
    // 'node'/'react-server') el profiling bundle rompe el render de router-server.
    const env = context.customResolverOptions?.environment;
    const isServer = env === 'node' || env === 'react-server';
    // El cjs con profiling requiere 'react-dom' para leer sus internals
    // (__DOM_INTERNALS): si se le re-mapea a sí mismo queda un ciclo con
    // exports parciales (internals undefined → crash). Desde los cjs de
    // react-dom se resuelve el índice estándar; desde el resto de la app,
    // a la entrada profiling.
    const fromReactDOMCjs = /react-dom[\\/]cjs[\\/]/.test(context.originModulePath ?? '');
    if (!isServer && !fromReactDOMCjs) {
      if (moduleName === 'react-dom' || moduleName === 'react-dom/client') {
        return context.resolveRequest(context, 'react-dom/profiling', platform);
      }
    }
    if (originalResolveRequest) {
      return originalResolveRequest(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  };
}

module.exports = config;
