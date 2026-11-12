export const firebaseConfig = {
  apiKey: "AIzaSyCfo3UqEb77ihYOqSJZvIFVr2VRGf6dJ4w",
  authDomain: "plant-monitor-3976f.firebaseapp.com",
  databaseURL: "https://plant-monitor-3976f-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "plant-monitor-3976f",
  storageBucket: "plant-monitor-3976f.appspot.com",
  messagingSenderId: "705425147510",
  appId: "1:705425147510:web:71f15bde879f3672df8157",
  measurementId: "G-890H6FDBYE"
};

export const localEmulator = location.hostname === "127.0.0.1" &&
  new URLSearchParams(location.search).get("emulator") === "1";

export const activeFirebaseConfig = localEmulator ? {
  ...firebaseConfig,
  apiKey: "demo-api-key",
  projectId: "demo-novenyfigyelo",
  authDomain: "demo-novenyfigyelo.firebaseapp.com",
  databaseURL: "https://demo-novenyfigyelo-default-rtdb.firebaseio.com"
} : firebaseConfig;
