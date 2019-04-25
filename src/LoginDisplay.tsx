import React, { Component, ChangeEvent } from 'react';
import './LoginDisplay.css';
import { LoginInfo } from './App';

interface LoginDisplayProperties {
    info: LoginInfo
    onChange: (info: LoginInfo) => void
}

class LoginDisplay extends Component<
    LoginDisplayProperties,
    {
        passwordVisible: boolean,
        currentInfo: LoginInfo
    }
> {
    constructor(props: LoginDisplayProperties) {
        super(props);

        this.state = {
            passwordVisible: false,
            currentInfo: props.info
        };
    }

    updateName(e: ChangeEvent<HTMLInputElement>) {
        const name = (e.target as HTMLInputElement).value;

        this.setState({
            currentInfo: { ...this.state.currentInfo, name }
        });
    }

    updateUsername(e: ChangeEvent<HTMLInputElement>) {
        const username = (e.target as HTMLInputElement).value;

        this.setState({
            currentInfo: { ...this.state.currentInfo, username }
        });
    }

    updatePassword(e: ChangeEvent<HTMLInputElement>) {
        const password = (e.target as HTMLInputElement).value;

        this.setState({
            currentInfo: { ...this.state.currentInfo, password }
        });
    }

    togglePasswordVisibility() {
        this.setState({
            passwordVisible: !this.state.passwordVisible
        });
    }

    loginChanged() {
        this.props.onChange(this.state.currentInfo);
    }

    render() {
        let passwordInputType;
        let visibilityButtonText;

        if(this.state.passwordVisible) {
            passwordInputType = 'text';
            visibilityButtonText = 'Hide Password';
        } else {
            passwordInputType = 'password';
            visibilityButtonText = 'Show Password';
        }

        return <div className='LoginDisplay'>
            <input type='text' value={this.state.currentInfo.name} placeholder='name' onChange={(e) => this.updateName(e)} onBlur={() => this.loginChanged()} />
            <input type='text' value={this.state.currentInfo.username} placeholder='username' onChange={(e) => this.updateUsername(e)} onBlur={() => this.loginChanged()} />
            <input type={passwordInputType} value={this.state.currentInfo.password} placeholder='password' onChange={(e) => this.updatePassword(e)} onBlur={() => this.loginChanged()} />
            <input type='button' onClick={() => this.togglePasswordVisibility()} value={visibilityButtonText} />
        </div>;
    }
}

export default LoginDisplay;