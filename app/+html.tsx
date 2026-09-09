import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * Root HTML de cada página en el render estático web (vía de la doc oficial
 * de PWAs para `web.output: "static"`). Corre solo en Node, sin DOM.
 *
 * Replica los defaults del template de expo-router (@expo/router-server,
 * build/static/html.js) y agrega lo PWA: manifest, metas Apple para A2HS
 * (iOS no soporta la Fullscreen API ni lee bien `display` del manifest en
 * versiones viejas) y colores de marca.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />

        <ScrollViewStyleReset />

        <link rel="manifest" href="/manifest.json" />

        {/* iOS: Add to Home Screen (única vía "instalable" en iPhone). */}
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black" />
        <meta name="apple-mobile-web-app-title" content="Tasty Games" />

        {/* Android/Chrome legacy. */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#0F172A" />
      </head>
      <body>{children}</body>
    </html>
  );
}
