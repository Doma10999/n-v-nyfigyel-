importScripts('https://cdn.onesignal.com/sdks/OneSignalSDKWorker.js');


OneSignal.push(function() {
  OneSignal.sendSelfNotification(
    "Növényfigyelő",
    "A növény szomjas! Locsold meg! 🌱💧",
    'https://novenyfigyelo.netlify.app', // opcionális URL értesítés kattintásra
    'https://example.com/notification-icon.png', // opcionális ikon
    { notificationType: 'moistureAlert' }
  );
});
