import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBVx3OjGqIEnS3vGBUWgpIuaTY6Enajt4c",
  authDomain: "korea-scholar.firebaseapp.com", // 맞춤 도메인 대신 기본 도메인으로 복구
  projectId: "korea-scholar",
  storageBucket: "korea-scholar.firebasestorage.app",
  messagingSenderId: "765446290553",
  appId: "1:765446290553:web:04dbdd7c115717767c68a8",
  measurementId: "G-BNSW1HX81F"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);
export const signInWithEmail = (email, password) => signInWithEmailAndPassword(auth, email, password);
export const signUpWithEmail = (email, password) => createUserWithEmailAndPassword(auth, email, password);
export const resetPassword = (email) => sendPasswordResetEmail(auth, email);
export const logOut = () => signOut(auth);
