import React, { Component } from 'react';
import './App.css';
import LoginDisplay from './LoginDisplay';

export interface LoginInfo {
    name: string,
    username: string,
    password: string
}

class App extends Component<{}, {
    logins: { [id: string]: LoginInfo },
    newLogin: boolean,
    nextLoginId: number
}> {
    constructor(props: {}) {
        super(props);

        this.state = {
            logins: {},
            newLogin: false,
            nextLoginId: 0
        };
    }

    updateLogin(id: string, info: LoginInfo) {
        this.setState({
            logins: { ...this.state.logins, [id]: info }
        });
    }

    addNewLogin() {
        this.setState({
            newLogin: true
        });
    }

    newLoginUpdated(info: LoginInfo) {
        const id = this.state.nextLoginId.toString();

        this.setState({
            logins: { ...this.state.logins, [id]: info },
            newLogin: false,
            nextLoginId: this.state.nextLoginId + 1
        });
    }

    render() {
        const logins = Object.entries(this.state.logins).map(([id, info]) => 
            <LoginDisplay key={id} info={info} onChange={(info) => this.updateLogin(id, info)} />
        );

        let newLogin;
        if(this.state.newLogin) {
            newLogin = <LoginDisplay info={{ name: '', username: '', password: '' }} onChange={(info) => this.newLoginUpdated(info)} />;
        }

        return <div id='App'>
            {logins}
            {newLogin}
            <input id='newLogin' type='button' value='New Login' onClick={() => this.addNewLogin()} />
        </div>;
    }
}

export default App;