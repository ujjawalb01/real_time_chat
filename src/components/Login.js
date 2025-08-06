import React, { useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import styles from '../styles/Form.module.css';

function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password,setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await axios.post('http://localhost:5000/api/login', {username, password});
      onLogin(res.data.token, res.data.username);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    }
  };

  return (
    <form className={styles.form} onSubmit={submit}>
      <h2>Login</h2>
      <input 
        placeholder="Username" 
        value={username} 
        onChange={e=>setUsername(e.target.value)} 
        required
        className={styles.input}
      />
      <input 
        type="password" 
        placeholder="Password" 
        value={password} 
        onChange={e=>setPassword(e.target.value)} 
        required
        className={styles.input}
      />
      <button type="submit" className={styles.button}>Login</button>
      {error && <p className={styles.errorMessage}>{error}</p>}
      <p>
        No account? <Link to="/register">Register</Link>
      </p>
    </form>
  );
}

export default Login;
