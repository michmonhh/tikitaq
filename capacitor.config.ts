import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.tikitaq.app',
  appName: 'TIKITAQ',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#0a0e1a',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0a0e1a',
    },
  },
}

export default config
