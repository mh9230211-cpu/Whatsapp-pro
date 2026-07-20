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

const firebaseConfig = {
  apiKey: "AIzaSyAKm4JBF1_nt_QZJKwugflfiTqMvD8nteg",
  authDomain: "super-app-f852a.firebaseapp.com",
  projectId: "super-app-f852a",
  storageBucket: "super-app-f852a.firebasestorage.app",
  messagingSenderId: "12677675923",
  appId: "1:12677675923:web:bf79fefa42a8ebd995c666",
  measurementId: "G-JL4GLX5WJ1"
};

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

export default function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const [activeChat, setActiveChat] = useState(null); // will hold a contact user object now, not just email
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [contacts, setContacts] = useState([]); // real users from Firestore
  const [isSignUp, setIsSignUp] = useState(false);

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
        // Create/update the user's profile doc in Firestore
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

  // ---------- TRACK APP FOREGROUND/BACKGROUND -> ONLINE STATUS ----------
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

  // ---------- REAL-TIME CONTACT LIST (all users except me) ----------
  useEffect(() => {
    if (!db || !user) return;

    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      const all = snapshot.docs
        .map((d) => d.data())
        .filter((u) => u.uid !== user.uid);
      setContacts(all);
    });

    return unsubscribe;
  }, [user]);

  // ---------- REAL-TIME MESSAGES FOR ACTIVE CHAT ----------
  useEffect(() => {
    if (!db || !user || !activeChat) return;

    const q = query(
      collection(db, 'chats'),
      where('room', 'in', [`${user.email}_${activeChat.email}`, `${activeChat.email}_${user.email}`]),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMessages(
        snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data()
        }))
      );
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
    Alert.alert(
      "Log Out",
      "Are you sure you want to log out?",
      [
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
      ]
    );
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || !db || !user || !activeChat) return;

    const msgData = {
      room: `${user.email}_${activeChat.email}`,
      sender: user.email,
      to: activeChat.email,
      text: chatInput,
      createdAt: Date.now(), // used for ordering/query (number, indexable)
      serverCreatedAt: serverTimestamp(), // accurate server-side time
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    try {
      await addDoc(collection(db, 'chats'), msgData);
      setChatInput('');
    } catch (error) {
      Alert.alert("Failed to send", "Check your internet connection.");
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#00A884" />
        <Text style={{ color: '#fff', marginTop: 15, fontSize: 16 }}>WhatsApp...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.container}>
        <Text style={styles.whatsappLogo}>WhatsApp</Text>
        <Text style={styles.subTitle}>
          {isSignUp ? 'Create your account' : 'Log in to WhatsApp'}
        </Text>

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

        <TouchableOpacity style={styles.whatsappBtn} onPress={isSignUp ? handleSignUp : handleLogin}>
          <Text style={styles.btnText}>{isSignUp ? 'Sign Up' : 'Log In'}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setIsSignUp(!isSignUp)} style={{ marginTop: 25 }}>
          <Text style={{ color: '#00A884', fontWeight: '600', fontSize: 15 }}>
            {isSignUp ? 'Already have an account? Log in' : "Don't have an account? Sign up"}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (activeChat) {
    return (
      <View style={styles.chatContainer}>
        <View style={styles.chatHeader}>
          <TouchableOpacity onPress={() => setActiveChat(null)} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={styles.backBtn}>◀</Text>
            <View style={styles.avatarSmall}><Text style={{ color: '#fff' }}>👤</Text></View>
            <View>
              <Text style={styles.headerTitle}>{activeChat.email.split('@')[0]}</Text>
              <Text style={styles.headerSubtitle}>{activeChat.online ? 'online' : 'offline'}</Text>
            </View>
          </TouchableOpacity>
          <Text style={{ color: '#fff', fontSize: 20 }}>⋮</Text>
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
    <View style={styles.chatContainer}>
      <View style={styles.mainHeader}>
        <Text style={styles.mainHeaderTitle}>WhatsApp</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity style={{ marginRight: 20 }}><Text style={{ color: '#fff', fontSize: 18 }}>📷</Text></TouchableOpacity>
          <TouchableOpacity style={{ marginRight: 20 }}><Text style={{ color: '#fff', fontSize: 18 }}>🔍</Text></TouchableOpacity>
          <TouchableOpacity onPress={handleLogout}><Text style={{ color: '#fff', fontSize: 18 }}>⋮</Text></TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.chatListArea}>
        {contacts.length === 0 && (
          <Text style={{ color: '#8696a0', textAlign: 'center', marginTop: 30 }}>
            No other users yet. Ask a friend to sign up!
          </Text>
        )}
        {contacts.map((contact) => (
          <TouchableOpacity key={contact.uid} style={styles.contactCard} onPress={() => setActiveChat(contact)}>
            <View style={styles.avatarLarge}>
              <Text style={{ color: '#fff', fontSize: 20 }}>👤</Text>
              {contact.online && <View style={styles.onlineDot} />}
            </View>
            <View style={styles.contactInfo}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={styles.contactName}>{contact.email.split('@')[0]}</Text>
                <Text style={styles.timeTextList}>{contact.online ? 'online' : 'offline'}</Text>
              </View>
              <Text style={styles.contactSub}>Tap to open encrypted chat</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* WhatsApp Style Bottom Tabs */}
      <View style={styles.bottomTabs}>
        <TouchableOpacity style={styles.tabItem}>
          <Text style={styles.tabIconActive}>💬</Text>
          <Text style={styles.tabTextActive}>Chats</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem}>
          <Text style={styles.tabIcon}>🔄</Text>
          <Text style={styles.tabText}>Updates</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem}>
          <Text style={styles.tabIcon}>👥</Text>
          <Text style={styles.tabText}>Communities</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem}>
          <Text style={styles.tabIcon}>📞</Text>
          <Text style={styles.tabText}>Calls</Text>
        </TouchableOpacity>
      </View>

      {/* Kept your AdMob Banner */}
      <View style={styles.adBannerContainer}>
        <Text style={styles.adText}>Google AdMob Banner Advertisement</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111B21', paddingHorizontal: 30 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111B21' },
  whatsappLogo: { color: '#ffffff', fontSize: 32, fontWeight: 'bold', marginBottom: 10 },
  subTitle: { color: '#8696a0', fontSize: 16, marginBottom: 40 },
  input: { width: '100%', backgroundColor: '#202C33', color: '#ffffff', paddingVertical: 15, paddingHorizontal: 20, borderRadius: 8, marginBottom: 15, fontSize: 16 },
  whatsappBtn: { backgroundColor: '#00A884', paddingVertical: 15, width: '100%', borderRadius: 25, alignItems: 'center', marginTop: 10 },
  btnText: { color: '#111B21', fontSize: 16, fontWeight: 'bold' },
  btnTextIcon: { color: '#111B21', fontSize: 14, fontWeight: 'bold' },

  chatContainer: { flex: 1, backgroundColor: '#111B21', paddingTop: 40 },
  mainHeader: { flexDirection: 'row', backgroundColor: '#111B21', paddingHorizontal: 15, paddingVertical: 15, alignItems: 'center', justifyContent: 'space-between' },
  mainHeaderTitle: { color: '#ffffff', fontSize: 24, fontWeight: '600' },

  chatHeader: { flexDirection: 'row', backgroundColor: '#202C33', paddingHorizontal: 10, paddingVertical: 10, alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { color: '#fff', fontSize: 18, marginRight: 5 },
  headerTitle: { color: '#ffffff', fontSize: 18, fontWeight: '600', textTransform: 'capitalize' },
  headerSubtitle: { color: '#8696a0', fontSize: 12 },
  avatarSmall: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#687781', justifyContent: 'center', alignItems: 'center', marginRight: 10 },

  chatListArea: { flex: 1, backgroundColor: '#111B21' },
  contactCard: { flexDirection: 'row', paddingHorizontal: 15, paddingVertical: 12, alignItems: 'center' },
  avatarLarge: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#687781', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  onlineDot: { position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: '#00A884', borderWidth: 2, borderColor: '#111B21' },
  contactInfo: { flex: 1, borderBottomWidth: 0.5, borderBottomColor: '#202C33', paddingBottom: 12 },
  contactName: { color: '#e9edef', fontSize: 17, fontWeight: '500', textTransform: 'capitalize' },
  contactSub: { color: '#8696a0', fontSize: 14, marginTop: 3 },
  timeTextList: { color: '#8696a0', fontSize: 12 },

  chatArea: { flex: 1, paddingHorizontal: 15, paddingTop: 10, backgroundColor: '#0B141A' },
  msgMe: { backgroundColor: '#005C4B', padding: 8, paddingHorizontal: 12, borderRadius: 12, alignSelf: 'flex-end', marginBottom: 10, maxWidth: '80%' },
  msgFriend: { backgroundColor: '#202C33', padding: 8, paddingHorizontal: 12, borderRadius: 12, alignSelf: 'flex-start', marginBottom: 10, maxWidth: '80%' },
  msgText: { color: '#e9edef', fontSize: 16 },
  timeText: { color: '#8696a0', fontSize: 11, alignSelf: 'flex-end', marginTop: 2 },

  inputBar: { flexDirection: 'row', padding: 10, backgroundColor: '#202C33', alignItems: 'center' },
  iconBtn: { padding: 10 },
  inputField: { flex: 1, backgroundColor: '#2A3942', color: '#ffffff', paddingVertical: 10, paddingHorizontal: 15, borderRadius: 25, marginRight: 10, fontSize: 16 },
  sendBtn: { backgroundColor: '#00A884', width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },

  bottomTabs: { flexDirection: 'row', backgroundColor: '#111B21', paddingVertical: 10, borderTopWidth: 0.5, borderTopColor: '#202C33', justifyContent: 'space-around' },
  tabItem: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  tabIconActive: { fontSize: 22, marginBottom: 4, opacity: 1 },
  tabIcon: { fontSize: 22, marginBottom: 4, opacity: 0.5 },
  tabTextActive: { color: '#ffffff', fontSize: 12, fontWeight: '600' },
  tabText: { color: '#8696a0', fontSize: 12, fontWeight: '500' },

  adBannerContainer: { backgroundColor: '#202C33', paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  adText: { color: '#00A884', fontSize: 12, fontWeight: 'bold', letterSpacing: 1 }
});
      
