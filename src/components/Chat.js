import React, { useState, useEffect, useContext, useRef } from 'react';
import axios from 'axios';
import { SocketContext } from '../App';
import styles from '../styles/Chat.module.css';

function Chat({ username, onLogout }) {
  const socket = useContext(SocketContext);

  // States
  const [rooms, setRooms] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState('');
  const [messages, setMessages] = useState([]);
  const [newRoomName, setNewRoomName] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [typingUsers, setTypingUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const fileInputRef = useRef();

  useEffect(() => {
    if (!username) return;
    fetchRooms();
  }, [username]);

  useEffect(() => {
    if (selectedRoom) fetchMessages(selectedRoom);
  }, [selectedRoom]);

  // Socket listeners
  useEffect(() => {
    if (!socket) return;

    const messageHandler = (msg) => {
      console.log('Received message:', msg);
      if (msg.roomId === selectedRoom) {
        setMessages((prev) => [...prev, msg]);
      }
    };

    socket.on('message', messageHandler);

    socket.on('user_online', (user) => {
      setOnlineUsers((prev) => new Set(prev).add(user));
    });

    socket.on('user_offline', (user) => {
      setOnlineUsers((prev) => {
        const newSet = new Set(prev);
        newSet.delete(user);
        return newSet;
      });
    });

    socket.on('typing_users', (usersTyping) => {
      setTypingUsers(usersTyping.filter(u => u !== username));
    });

    return () => {
      socket.off('message', messageHandler);
      socket.off('user_online');
      socket.off('user_offline');
      socket.off('typing_users');
    };
  }, [socket, selectedRoom, username]);

  const fetchRooms = async () => {
    const res = await axios.get(`http://localhost:5000/api/rooms/${username}`);
    setRooms(res.data);
    if (res.data.length > 0) setSelectedRoom(res.data[0].roomId);
  };

  const fetchMessages = async (roomId) => {
    const res = await axios.get(`http://localhost:5000/api/messages/${roomId}`);
    setMessages(res.data);
    if (socket) socket.emit('join_room', roomId); // IMPORTANT to join room
  };

  const createRoom = async () => {
    if (!newRoomName.trim()) {
      alert('Enter a room ID');
      return;
    }
    try {
      await axios.post('http://localhost:5000/api/create_room', {
        roomId: newRoomName.trim(),
        members: [username],
      });
      setNewRoomName('');
      fetchRooms();
    } catch (e) {
      alert(e.response?.data?.error || 'Could not create room');
    }
  };

  const sendMessage = () => {
    if (!newMessage.trim() || !selectedRoom || !socket) return;

    // Make sure we join the room before sending — fixes "no text shown" issue
    socket.emit('join_room', selectedRoom);

    socket.emit('send_message', {
      roomId: selectedRoom,
      content: newMessage,
      type: 'text',
    });
    setNewMessage('');
    socket.emit('typing', { roomId: selectedRoom, typing: false });
  };

  const onTypingChange = (e) => {
    setNewMessage(e.target.value);
    socket.emit('typing', { roomId: selectedRoom, typing: e.target.value.length > 0 });
  };

  const sendFile = async (file) => {
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await axios.post('http://localhost:5000/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      socket.emit('send_message', {
        roomId: selectedRoom,
        content: 'File',
        type: 'file',
        fileUrl: res.data.fileUrl,
      });
    } catch {
      alert('File upload failed');
    }
  };

  // User search for private chat
  useEffect(() => {
    if (!searchTerm) {
      setSearchResults([]);
      return;
    }
    const timeoutId = setTimeout(async () => {
      try {
        const res = await axios.get(`http://localhost:5000/api/users/search/${searchTerm}`);
        setSearchResults(res.data.filter(u => u !== username));
      } catch {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchTerm, username]);

  const startPrivateChat = async (otherUsername) => {
    const users = [username, otherUsername].sort();
    const privateRoomId = users.join('_');

    try {
      const existingRoom = rooms.find(r => r.roomId === privateRoomId);
      if (!existingRoom) {
        await axios.post('http://localhost:5000/api/create_room', {
          roomId: privateRoomId,
          members: users,
        });
      }
      setSelectedRoom(privateRoomId);
      setSearchTerm('');
      setSearchResults([]);
      fetchRooms();
    } catch {
      alert('Failed to create private chat');
    }
  };

  // Browser notifications for messages in other rooms
  useEffect(() => {
    if (!socket) return;

    if (Notification.permission !== 'granted') {
      Notification.requestPermission();
    }

    const notificationHandler = (msg) => {
      if (msg.roomId !== selectedRoom) {
        if (Notification.permission === 'granted') {
          new Notification(`New message from ${msg.sender}`, {
            body: msg.type === 'text' ? msg.content : 'Sent a file',
            icon: '/favicon.ico',
          });
        }
      }
    };

    socket.on('message', notificationHandler);
    return () => socket.off('message', notificationHandler);
  }, [socket, selectedRoom]);

  return (
    <div className={styles.chatContainer}>
      <div className={styles.sidebar}>
        <h3>Rooms</h3>
        <ul className={styles.roomList}>
          {rooms.map((r) => (
            <li
              key={r.roomId}
              onClick={() => setSelectedRoom(r.roomId)}
              className={selectedRoom === r.roomId ? styles.active : ''}
              title={`Members: ${r.members.join(', ')}`}
            >
              {r.roomId}
            </li>
          ))}
        </ul>
        <div className={styles.inputGroup}>
          <input
            placeholder="New room ID"
            value={newRoomName}
            onChange={(e) => setNewRoomName(e.target.value)}
            className={styles.input}
          />
          <button onClick={createRoom} className={styles.buttonSmall}>Create</button>
        </div>

        <h4>Start Private Chat</h4>
        <input
          placeholder="Search users..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className={styles.input}
        />
        <ul className={styles.userList}>
          {searchResults.map(user => (
            <li key={user} onClick={() => startPrivateChat(user)} style={{ cursor: 'pointer' }}>
              {user}
            </li>
          ))}
        </ul>

        <h4>Online Users</h4>
        <ul className={styles.userList}>
          {[...onlineUsers].map(user => (
            <li key={user} style={{ fontWeight: user === username ? 'bold' : 'normal' }}>
              {user} <span style={{ color: 'green' }}>●</span>
            </li>
          ))}
        </ul>

        <button onClick={onLogout} className={styles.logoutBtn}>Logout</button>
      </div>

      <div className={styles.chatPanel}>
        <div className={styles.messages} id="messageList">
          {messages.map((m) => (
            <div key={m._id} className={styles.message}>
              <b>{m.sender}:</b>{' '}
              {m.type === 'text' ? (
                m.content
              ) : m.type === 'file' && m.fileUrl ? (
                /\.(jpeg|jpg|gif|png)$/i.test(m.fileUrl) ? (
                  <img
                    src={m.fileUrl}
                    alt="sent file"
                    style={{ maxWidth: '200px', maxHeight: '200px' }}
                  />
                ) : /\.(mp4|webm)$/i.test(m.fileUrl) ? (
                  <video src={m.fileUrl} controls style={{ maxWidth: '300px' }} />
                ) : (
                  <a href={m.fileUrl} target="_blank" rel="noreferrer">
                    Download File
                  </a>
                )
              ) : null}
              <div className={styles.messageTime}>
                {new Date(m.createdAt).toLocaleTimeString()}
              </div>
            </div>
          ))}
          {typingUsers.length > 0 && (
            <div className={styles.typingIndicator}>
              {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
            </div>
          )}
        </div>

        <div className={styles.inputArea}>
          <input
            type="text"
            placeholder="New message"
            value={newMessage}
            onChange={onTypingChange}
            onKeyDown={e => {
              if (e.key === 'Enter') sendMessage();
            }}
            className={styles.textInput}
          />
          <button onClick={sendMessage} className={styles.button}>Send</button>

          <input
            type="file"
            ref={fileInputRef}
            className={styles.fileInput}
            onChange={e => {
              sendFile(e.target.files[0]);
              e.target.value = null;
            }}
          />
          <button
            onClick={() => fileInputRef.current.click()}
            className={`${styles.button} ${styles.fileButton}`}
          >
            Send File
          </button>
        </div>
      </div>
    </div>
  );
}

export default Chat;
