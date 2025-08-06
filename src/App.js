import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import io from 'socket.io-client';

import Login from './components/Login';
import Register from './components/Register';
import Chat from './components/Chat';

export const SocketContext = React.createContext();

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [username, setUsername] = useState(localStorage.getItem('username'));
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (token && !socket) {
      const s = io('http://localhost:5000', {
        auth: { token },
      });
      setSocket(s);
      return () => s.disconnect();
    }
  }, [token]);

  const logout = () => {
    setToken(null);
    setUsername(null);
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    if (socket) socket.disconnect();
    setSocket(null);
  };

  return (
    <SocketContext.Provider value={socket}>
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={
              token ? (
                <Chat username={username} onLogout={logout} />
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          <Route
            path="/login"
            element={
              <Login
                onLogin={(t, u) => {
                  setToken(t);
                  setUsername(u);
                  localStorage.setItem('token', t);
                  localStorage.setItem('username', u);
                }}
              />
            }
          />
          <Route path="/register" element={<Register />} />
        </Routes>
      </BrowserRouter>
    </SocketContext.Provider>
  );
}

export default App;
