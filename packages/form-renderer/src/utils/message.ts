export function sendMessageToParent(eventName: string) {
  window.parent?.postMessage(
    {
      source: 'MYFORM',
      eventName
    },
    '*'
  )
}
