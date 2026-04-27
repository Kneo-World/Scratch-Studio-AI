import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

let app: FirebaseApp;
let db: Firestore;
let auth: Auth;

async function initFirebase() {
  if (!app) {
    try {
      // Use a relative path so it works on subpaths (like GitHub Pages)
      const response = await fetch('./firebase-applet-config.json');
      if (!response.ok) {
        console.warn("firebase-applet-config.json not found, core Firebase features disabled.");
        return;
      }
      const firebaseConfig = await response.json();
      
      app = initializeApp(firebaseConfig);
      db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
      auth = getAuth(app);
    } catch (e) {
      console.error("Firebase init failed:", e);
    }
  }
}

export { initFirebase };
export const getDb = () => db;
export const getAuthClient = () => auth;
