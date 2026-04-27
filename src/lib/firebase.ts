import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

let app: FirebaseApp;
let db: Firestore;
let auth: Auth;

async function initFirebase() {
  if (!app) {
    try {
      // Try to find the config file. On GitHub Pages, it should be at the root of the project.
      // We check the relative path first.
      const paths = ['./firebase-applet-config.json', 'firebase-applet-config.json'];
      let config = null;

      for (const path of paths) {
        try {
          const response = await fetch(path);
          if (response.ok) {
            config = await response.json();
            console.log(`Firebase config loaded from: ${path}`);
            break;
          }
        } catch (e) {
          // Continue to next path
        }
      }

      if (!config) {
        console.warn("firebase-applet-config.json not found in expected locations.");
        return;
      }
      
      app = initializeApp(config);
      db = getFirestore(app, config.firestoreDatabaseId);
      auth = getAuth(app);
    } catch (e) {
      console.error("Firebase init failed error:", e);
    }
  }
}

export { initFirebase };
export const getDb = () => db;
export const getAuthClient = () => auth;
