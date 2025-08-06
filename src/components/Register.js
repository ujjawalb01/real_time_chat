import React, { useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import styles from '../styles/Form.module.css';

function Register() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await axios.post('http://localhost:5000/api/register', { username, password });
      alert('User created, please login!');
      navigate('/login');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    }
  };

  return (
    <form className={styles.form} onSubmit={submit}>
      <h2>Register</h2>
      <input 
        placeholder="Username" 
        value={username} 
        onChange={e => setUsername(e.target.value)} 
        required
        className={styles.input}
      />
      <input 
        type="password"
        placeholder="Password" 
        value={password} 
        onChange={e => setPassword(e.target.value)} 
        required
        className={styles.input}
      />
      <button type="submit" className={styles.button}>Register</button>
      {error && <p className={styles.errorMessage}>{error}</p>}
      <p>
        Already have an account? <Link to="/login">Login</Link>
      </p>
    </form>
  );
}

export default Register;
