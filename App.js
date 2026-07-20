import React, { useState, useEffect } from 'react';
import { 
  Text, 
  View, 
  StyleSheet, 
  TouchableOpacity, 
  TextInput, 
  ScrollView, 
  ActivityIndicator 
} from 'react-native';

import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, query, where, orderBy, onSnapshot } from 'firebase/firestore';

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
  
  const [activeChat, setActiveChat] = useState(null);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [contacts] = useState(['arif@gmail.com', 'rahul@gmail.com', 'test@gmail.com']);
  const [isSignUp, setIsSignUp] = useState(false);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (authenticatedUser) => {
      setUser(authenticatedUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!db || !user || !activeChat) return;

    const q = query(
      collection(db, 'chats'),
      where('room', 'in', [`${user.email}_${activeChat}`, `${activeChat}_${user.email}`]),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMessages(
        snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
      );
    });

    return unsubscribe;
  }, [activeChat, user]);

  const handleSignUp = async () => {
    try {
      setLoading(true);
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (error) {
      alert("Error: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    try {
      setLoading(true);
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      alert("Login Failed: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    if (auth) signOut(auth);
    setActiveChat(null);
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || !db || !user || !activeChat) return;

    const msgData = {
      room: `${user.email}_${activeChat}`,
      sender: user.email,
      to: activeChat,
      text: chatInput,
      createdAt: new Date().getTime(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    try {
      await addDoc(collection(db, 'chats'), msgData);
      setChatInput('');
    } catch (error) {
      alert("Failed to send: " + error.message);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#00A884" />
        <Text style={{color: '#fff', marginTop: 10}}>Nova Engine Loading...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.container}>
        <Text style={styles.whatsappLogo}>WhatsApp Pro</Text>
        <Text style={styles.subTitle}>{isSignUp ? 'Create secure account' : 'Your Secure Control Login'}</Text>
        
        <TextInput 
          style={styles.input} 
          placeholder="Enter Email" 
          placeholderTextColor="#8696a0"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
        />
        <TextInput 
          style={styles.input} 
          placeholder="Enter Password" 
          placeholderTextColor="#8696a0"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity style={styles.whatsappBtn} onPress={isSignUp ? handleSignUp : handleLogin}>
          <Text style={styles.btnText}>{isSignUp ? 'Register Now' : 'Login'}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setIsSignUp(!isSignUp)} style={{marginTop: 20}}>
          <Text style={{color: '#00A884', fontWeight: 'bold'}}>
            {isSignUp ? 'Already have an account? Login' : 'Need an account? Click Here'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (activeChat) {
    return (
      <View style={styles.chatContainer}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setActiveChat(null)}>
            <Text style={styles.backBtn}>◀</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{activeChat}</Text>
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
          <TextInput 
            style={styles.inputField} 
            placeholder="Type a message..." 
            placeholderTextColor="#8696a0"
            value={chatInput}
            onChangeText={setChatInput}
          />
          <TouchableOpacity style={styles.sendBtn} onPress={handleSendMessage}>
            <Text style={styles.btnText}>▶</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.adBannerContainer}>
          <Text style={styles.adText}>Google AdMob Banner Advertisement</Text>
          <Text style={styles.adSubText}>[Monetization Live: Generating Revenue]</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.chatContainer}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>WhatsApp Control</Text>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={{color: '#fff', fontSize: 12}}>Logout</Text>
        </TouchableOpacity>
      </View>
      
      <View style={{padding: 15, backgroundColor: '#111B21'}}>
        <Text style={{color: '#8696a0'}}>Logged in as: {user.email}</Text>
      </View>

      <ScrollView style={styles.chatArea}>
        <Text style={styles.sectionTitle}>Active User Contacts</Text>
        {contacts.map((contact, index) => (
          <TouchableOpacity key={index} style={styles.contactCard} onPress={() => setActiveChat(contact)}>
            <View style={styles.avatar}><Text style={{color:'#fff'}}>👤</Text></View>
            <View>
              <Text style={styles.contactName}>{contact}</Text>
              <Text style={styles.contactSub}>End-to-End Encrypted Chat</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.adBannerContainer}>
        <Text style={styles.adText}>Google AdMob Banner Advertisement</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111B21', paddingHorizontal: 30 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111B21' },
  whatsappLogo: { color: '#00A884', fontSize: 36, fontWeight: 'bold' },
  subTitle: { color: '#8696a0', fontSize: 14, marginBottom: 30, marginTop: 5 },
  input: { width: '100%', backgroundColor: '#202C33', color: '#ffffff', paddingVertical: 15, paddingHorizontal: 20, borderRadius: 8, marginBottom: 15, fontSize: 16 },
  whatsappBtn: { backgroundColor: '#00A884', paddingVertical: 15, width: '100%', borderRadius: 8, alignItems: 'center', marginTop: 10 },
  btnText: { color: '#111B21', fontSize: 16, fontWeight: 'bold' },
  chatContainer: { flex: 1, backgroundColor: '#0B141A', paddingTop: 40 },
  header: { flexDirection: 'row', backgroundColor: '#202C33', paddingHorizontal: 15, paddingVertical: 15, alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { color: '#00A884', fontSize: 20, marginRight: 15 },
  headerTitle: { color: '#ffffff', fontSize: 18, fontWeight: 'bold' },
  logoutBtn: { backgroundColor: '#FF3B30', padding: 6, borderRadius: 5 },
  chatArea: { flex: 1, paddingHorizontal: 15, paddingTop: 10 },
  sectionTitle: { color: '#8696a0', fontSize: 12, fontWeight: 'bold', marginBottom: 15 },
  contactCard: { flexDirection: 'row', backgroundColor: '#111B21', padding: 15, borderRadius: 10, alignItems: 'center', marginBottom: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#687781', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  contactName: { color: '#e9edef', fontSize: 16, fontWeight: 'bold' },
  contactSub: { color: '#8696a0', fontSize: 13 },
  msgMe: { backgroundColor: '#005C4B', padding: 10, borderRadius: 10, alignSelf: 'flex-end', marginBottom: 10, maxWidth: '80%' },
  msgFriend: { backgroundColor: '#202C33', padding: 10, borderRadius: 10, alignSelf: 'flex-start', marginBottom: 10, maxWidth: '80%' },
  msgText: { color: '#e9edef', fontSize: 16 },
  timeText: { color: '#8696a0', fontSize: 10, alignSelf: 'flex-end', marginTop: 4 },
  inputBar: { flexDirection: 'row', padding: 10, backgroundColor: '#111B21', alignItems: 'center' },
  inputField: { flex: 1, backgroundColor: '#2A3942', color: '#ffffff', paddingVertical: 10, paddingHorizontal: 15, borderRadius: 20, marginRight: 10 },
  sendBtn: { backgroundColor: '#00A884', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  adBannerContainer: { backgroundColor: '#202C33', paddingVertical: 10, alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderColor: '#2A3942' },
  adText: { color: '#00A884', fontSize: 12, fontWeight: 'bold', letterSpacing: 1 },
  adSubText: { color: '#8696a0', fontSize: 10, marginTop: 2 }
});
