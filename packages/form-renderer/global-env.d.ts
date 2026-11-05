declare global {
  interface Window {
    myform: {
      device: {
        ios: boolean
        android: boolean
        mobile: boolean
        windowHeight: number
        screenHeight: number
      }
    }
  }
}

export {}
