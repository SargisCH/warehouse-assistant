import React from 'react';
import ReactDOM from 'react-dom';
import { Amplify } from 'aws-amplify';
import App from './App';
import './styles.css';
const pool = process.env.REACT_APP_COGNITO_USER_POOL_ID;
const client = process.env.REACT_APP_COGNITO_CLIENT_ID;
if (pool && client)
  Amplify.configure({
    Auth: { Cognito: { userPoolId: pool, userPoolClientId: client } },
  });
ReactDOM.render(
  <React.StrictMode>
    <App configured={!!pool && !!client} />
  </React.StrictMode>,
  document.getElementById('root'),
);
