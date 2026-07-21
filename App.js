  import React, { useState, useEffect } from 'react';
import {
  Text,
  View,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  AppState
} from 'react-native';

import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';

// =====================================================
// 🔧 PASTE YOUR NEW "NovaChat" FIREBASE CONFIG HERE
// (Firebase Console → Project Settings → Your apps → Web app)
// =====================================================
const firebaseConfig = {
  apiKey: "PASTE_YOUR_API_KEY_HERE",
  authDomain: "PASTE_YOUR_AUTH_DOMAIN_HERE",
  projectId: "PASTE_YOUR_PROJECT_ID_HERE",
  storageBucket: "PASTE_YOUR_STORAGE_BUCKET_HERE",
  messagingSenderId: "PASTE_YOUR_SENDER_ID_HERE",
  appId: "PASTE_YOUR_APP_ID_HERE"
};

const APP_NAME = 'NovaChat';
const ACCENT_COLOR = '#6C5CE7'; // NovaChat's own accent color (distinct from WhatsApp green)

let app, auth, db;
if (!getApps().length) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (error) {
    console.log("Firebase Connection Error: ", error);
  }
}

// Generates a consistent color from a string (email) so each user
// gets a stable avatar color without needing image storage
const AVATAR_COLORS = ['#6C5CE7', '#00B894', '#0984E3', '#E17055', '#FDCB6E', '#E84393', '#00CEC9'];
function getAvatarColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
function getInitial(nameOrEmail) {
  return (nameOrEmail || '?').trim().charAt(0).toUpperCase();
}

export default function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSignUp, setIsSignUp] = useState(false);

  const [activeChat, setActiveChat] = useState(null);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [contacts, setContacts] = useState([]);

  const [showProfile, setShowProfile] = useState(false);
  const [myProfile, setMyProfile] = useState(null);
  const [profileNameInput, setProfileNameInput] = useState('');

  // ---------- AUTH STATE + USER DOC SYNC ----------
  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, async (authenticatedUser) => {
      setUser(authenticatedUser);
      setLoading(false);

      if (authenticatedUser && db) {
        try {
          await setDoc(
            doc(db, 'users', authenticatedUser.uid),
            {
              uid: authenticatedUser.uid,
              email: authenticatedUser.email,
              online: true,
              lastSeen: serverTimestamp()
            },
            { merge: true }
          );
        } catch (e) {
          console.log('User doc sync failed:', e);
        }
      }
    });
    return unsubscribe;
  }, []);

  // ---------- ONLINE / OFFLINE TRACKING ----------
  useEffect(() => {
    if (!user || !db) return;

    const setOnline = (isOnline) => {
      updateDoc(doc(db, 'users', user.uid), {
        online: isOnline,
        lastSeen: serverTimestamp()
      }).catch(() => {});
    };

    const sub = AppState.addEventListener('change', (state) => {
      setOnline(state === 'active');
    });

    return () => {
      setOnline(false);
      sub.remove();
    };
  }, [user]);

  // ---------- REAL-TIME CONTACT LIST ----------
  useEffect(() => {
    if (!db || !user) return;

    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      const all = snapshot.docs.map((d) => d.data()).filter((u) => u.uid !== user.uid);
      setContacts(all);
    });

    return unsubscribe;
  }, [user]);

  // ---------- REAL-TIME OWN PROFILE ----------
  useEffect(() => {
    if (!db || !user) return;

    const unsubscribe = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setMyProfile(data);
        setProfileNameInput(data.displayName || '');
      }
    });

    return unsubscribe;
  }, [user]);

  // ---------- REAL-TIME MESSAGES ----------
  useEffect(() => {
    if (!db || !user || !activeChat) return;

    const q = query(
      collection(db, 'chats'),
      where('room', 'in', [`${user.email}_${activeChat.email}`, `${activeChat.email}_${user.email}`]),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });

    return unsubscribe;
  }, [activeChat, user]);

  const handleSignUp = async () => {
    if (!email || !password) {
      Alert.alert("Required", "Please enter both email and password.");
      return;
    }
    try {
      setLoading(true);
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (error) {
      if (error.code === 'auth/email-already-in-use') {
        Alert.alert("Account Already Exists", "This email is already registered. Please log in instead.");
      } else if (error.code === 'auth/invalid-email') {
        Alert.alert("Invalid Email", "Please enter a valid email address.");
      } else if (error.code === 'auth/weak-password') {
        Alert.alert("Weak Password", "Password should be at least 6 characters.");
      } else {
        Alert.alert("Registration Failed", "Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Required", "Please enter both email and password.");
      return;
    }
    try {
      setLoading(true);
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      Alert.alert("Login Failed", "Invalid email or password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log Out",
        style: "destructive",
        onPress: async () => {
          if (user && db) {
            await updateDoc(doc(db, 'users', user.uid), {
              online: false,
              lastSeen: serverTimestamp()
            }).catch(() => {});
          }
          if (auth) signOut(auth);
          setActiveChat(null);
        }
      }
    ]);
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || !db || !user || !activeChat) return;

    const msgData = {
      room: `${user.email}_${activeChat.email}`,
      sender: user.email,
      to: activeChat.email,
      text: chatInput,
      createdAt: Date.now(),
      serverCreatedAt: serverTimestamp(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    try {
      await addDoc(collection(db, 'chats'), msgData);
      setChatInput('');
    } catch (error) {
      Alert.alert("Failed to send", "Check your internet connection.");
    }
  };

  const saveProfileName = async () => {
    if (!profileNameInput.trim()) {
      Alert.alert("Required", "Display name can't be empty.");
      return;
    }
    try {
      await updateDoc(doc(db, 'users', user.uid), { displayName: profileNameInput.trim() });
      Alert.alert("Saved", "Your profile has been updated.");
    } catch (error) {
      Alert.alert("Failed", "Could not save profile. Please try again.");
    }
  };

  // ================= SCREENS =================

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={ACCENT_COLOR} />
        <Text style={{ color: '#fff', marginTop: 15, fontSize: 16 }}>{APP_NAME}</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.container}>
        <Text style={styles.logo}>{APP_NAME}</Text>
        <Text style={styles.subTitle}>{isSignUp ? 'Create your account' : 'Welcome back'}</Text>

        <TextInput
          style={styles.input}
          placeholder="Email address"
          placeholderTextColor="#8696a0"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#8696a0"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity style={styles.primaryBtn} onPress={isSignUp ? handleSignUp : handleLogin}>
          <Text style={styles.btnText}>{isSignUp ? 'Sign Up' : 'Log In'}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setIsSignUp(!isSignUp)} style={{ marginTop: 25 }}>
          <Text style={{ color: ACCENT_COLOR, fontWeight: '600', fontSize: 15 }}>
            {isSignUp ? 'Already have an account? Log in' : "Don't have an account? Sign up"}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (showProfile) {
    return (
      <View style={styles.screenContainer}>
        <View style={styles.topHeader}>
          <TouchableOpacity onPress={() => setShowProfile(false)} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={styles.backBtn}>◀</Text>
            <Text style={styles.headerTitle}>Profile</Text>
          </TouchableOpacity>
        </View>

        <View style={{ alignItems: 'center', paddingTop: 40 }}>
          <View style={[styles.avatarProfile, { backgroundColor: getAvatarColor(user.email) }]}>
            <Text style={styles.avatarProfileLetter}>{getInitial(myProfile?.displayName || user.email)}</Text>
          </View>
          <Text style={{ color: '#8696a0', textAlign: 'center', marginTop: 10, fontSize: 12 }}>
            Avatars are auto-generated from your name for now
          </Text>

          <View style={{ width: '100%', paddingHorizontal: 30, marginTop: 30 }}>
            <Text style={{ color: '#8696a0', marginBottom: 8, fontSize: 13 }}>YOUR NAME</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your display name"
              placeholderTextColor="#8696a0"
              value={profileNameInput}
              onChangeText={setProfileNameInput}
            />
            <TouchableOpacity style={styles.primaryBtn} onPress={saveProfileName}>
              <Text style={styles.btnText}>Save</Text>
            </TouchableOpacity>
            <Text style={{ color: '#8696a0', marginTop: 20, fontSize: 13 }}>{user.email}</Text>
          </View>
        </View>
      </View>
    );
  }

  if (activeChat) {
    return (
      <View style={styles.screenContainer}>
        <View style={styles.chatHeader}>
          <TouchableOpacity onPress={() => setActiveChat(null)} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={styles.backBtn}>◀</Text>
            <View style={[styles.avatarSmall, { backgroundColor: getAvatarColor(activeChat.email) }]}>
              <Text style={styles.avatarLetter}>{getInitial(activeChat.displayName || activeChat.email)}</Text>
            </View>
            <View>
              <Text style={styles.headerTitle}>{activeChat.displayName || activeChat.email.split('@')[0]}</Text>
              <Text style={styles.headerSubtitle}>{activeChat.online ? 'online' : 'offline'}</Text>
            </View>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.chatArea}>
          {messages.map((msg) => {
            const isMe = msg.sender === user.email;
            return (
              <View key={msg.id} style={isMe ? styles.msgMe : styles.msgFriend}>
                <Text style={styles.msgText}>{msg.text}</Text>
                <Text style={styles.timeText}>{msg.timestamp || 'now'}</Text>
              </View>
            );
          })}
        </ScrollView>

        <View style={styles.inputBar}>
          <TouchableOpacity style={styles.iconBtn}><Text style={{ fontSize: 20 }}>😊</Text></TouchableOpacity>
          <TextInput
            style={styles.inputField}
            placeholder="Message"
            placeholderTextColor="#8696a0"
            value={chatInput}
            onChangeText={setChatInput}
          />
          <TouchableOpacity style={styles.sendBtn} onPress={handleSendMessage}>
            <Text style={styles.btnTextIcon}>▶</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screenContainer}>
      <View style={styles.mainHeader}>
        <Text style={styles.mainHeaderTitle}>{APP_NAME}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity style={{ marginRight: 20 }} onPress={() => setShowProfile(true)}>
            <View style={[styles.avatarTiny, { backgroundColor: getAvatarColor(user.email) }]}>
              <Text style={styles.avatarLetterTiny}>{getInitial(myProfile?.displayName || user.email)}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLogout}><Text style={{ color: '#fff', fontSize: 18 }}>⋮</Text></TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.chatListArea}>
        {contacts.length === 0 && (
          <Text style={{ color: '#8696a0', textAlign: 'center', marginTop: 30 }}>
            No other users yet. Invite a friend to join {APP_NAME}!
          </Text>
        )}
        {contacts.map((contact) => (
          <TouchableOpacity key={contact.uid} style={styles.contactCard} onPress={() => setActiveChat(contact)}>
            <View style={[styles.avatarLarge, { backgroundColor: getAvatarColor(contact.email) }]}>
              <Text style={styles.avatarLetterLarge}>{getInitial(contact.displayName || contact.email)}</Text>
              {contact.online && <View style={styles.onlineDot} />}
            </View>
            <View style={styles.contactInfo}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={styles.contactName}>{contact.displayName || contact.email.split('@')[0]}</Text>
                <Text style={styles.timeTextList}>{contact.online ? 'online' : 'offline'}</Text>
              </View>
              <Text style={styles.contactSub}>Tap to start chatting</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111417', paddingHorizontal: 30 },
  screenContainer: { flex: 1, backgroundColor: '#111417', paddingTop: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111417' },

  logo: { color: '#ffffff', fontSize: 32, fontWeight: 'bold', marginBottom: 10 },
  subTitle: { color: '#8696a0', fontSize: 16, marginBottom: 40 },
  input: { width: '100%', backgroundColor: '#1E2126', color: '#ffffff', paddingVertical: 15, paddingHorizontal: 20, borderRadius: 8, marginBottom: 15, fontSize: 16 },
  primaryBtn: { backgroundColor: ACCENT_COLOR, paddingVertical: 15, width: '100%', borderRadius: 25, alignItems: 'center', marginTop: 10 },
  btnText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  btnTextIcon: { color: '#ffffff', fontSize: 14, fontWeight: 'bold' },

  topHeader: { flexDirection: 'row', backgroundColor: '#1E2126', paddingHorizontal: 15, paddingVertical: 15, alignItems: 'center' },
  mainHeader: { flexDirection: 'row', backgroundColor: '#111417', paddingHorizontal: 15, paddingVertical: 15, alignItems: 'center', justifyContent: 'space-between' },
  mainHeaderTitle: { color: '#ffffff', fontSize: 24, fontWeight: '700' },

  chatHeader: { flexDirection: 'row', backgroundColor: '#1E2126', paddingHorizontal: 10, paddingVertical: 10, alignItems: 'center' },
  backBtn: { color: '#fff', fontSize: 18, marginRight: 5 },
  headerTitle: { color: '#ffffff', fontSize: 18, fontWeight: '600' },
  headerSubtitle: { color: '#8696a0', fontSize: 12 },

  avatarSmall: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  avatarLetter: { color: '#fff', fontSize: 16, fontWeight: '700' },
  avatarTiny: { width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  avatarLetterTiny: { color: '#fff', fontSize: 12, fontWeight: '700' },
  avatarProfile: { width: 130, height: 130, borderRadius: 65, justifyContent: 'center', alignItems: 'center' },
  avatarProfileLetter: { color: '#fff', fontSize: 50, fontWeight: '700' },

  chatListArea: { flex: 1, backgroundColor: '#111417' },
  contactCard: { flexDirection: 'row', paddingHorizontal: 15, paddingVertical: 12, alignItems: 'center' },
  avatarLarge: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  avatarLetterLarge: { color: '#fff', fontSize: 20, fontWeight: '700' },
  onlineDot: { position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: ACCENT_COLOR, borderWidth: 2, borderColor: '#111417' },
  contactInfo: { flex: 1, borderBottomWidth: 0.5, borderBottomColor: '#1E2126', paddingBottom: 12 },
  contactName: { color: '#e9edef', fontSize: 17, fontWeight: '500' },
  contactSub: { color: '#8696a0', fontSize: 14, marginTop: 3 },
  timeTextList: { color: '#8696a0', fontSize: 12 },

  chatArea: { flex: 1, paddingHorizontal: 15, paddingTop: 10, backgroundColor: '#0B0D0F' },
  msgMe: { backgroundColor: ACCENT_COLOR, padding: 8, paddingHorizontal: 12, borderRadius: 12, alignSelf: 'flex-end', marginBottom: 10, maxWidth: '80%' },
  msgFriend: { backgroundColor: '#1E2126', padding: 8, paddingHorizontal: 12, borderRadius: 12, alignSelf: 'flex-start', marginBottom: 10, maxWidth: '80%' },
  msgText: { color: '#e9edef', fontSize: 16 },
  timeText: { color: '#d4cdfa', fontSize: 11, alignSelf: 'flex-end', marginTop: 2 },

  inputBar: { flexDirection: 'row', padding: 10, backgroundColor: '#1E2126', alignItems: 'center' },
  iconBtn: { padding: 10 },
  inputField: { flex: 1, backgroundColor: '#2A2E35', color: '#ffffff', paddingVertical: 10, paddingHorizontal: 15, borderRadius: 25, marginRight: 10, fontSize: 16 },
  sendBtn: { backgroundColor: ACCENT_COLOR, width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' }
});
                                       
