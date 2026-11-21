// Firebase web-app config for cloud sync. These values identify the project; they are not secrets.
// Access is protected by Firestore security rules (see firestore.rules) and by end-to-end encryption.
// Set to null to switch sync off.
export const firebaseConfig = {
  apiKey: "AIzaSyAZtbuRZGHlwierrVrRHW8grPTAGP0KdjY",
  authDomain: "campus-os-490d4.firebaseapp.com",
  projectId: "campus-os-490d4",
  storageBucket: "campus-os-490d4.firebasestorage.app",
  messagingSenderId: "562306818861",
  appId: "1:562306818861:web:8ddd68690786195b6869a4",
};

// Public reCAPTCHA Enterprise site key used by Firebase App Check (it only proves requests come from this website — it is not a secret).
// Registered in Firebase console → App Check → your web app → Fraud Defense (reCAPTCHA Enterprise). Set to "" to skip App Check.
export const appCheckSiteKey = "6LcEGCwuAAAAAOIkNOjhgSBkdRq8MjM1ozGOv9Fl";
