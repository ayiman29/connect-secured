import React from 'react'
import bracuLogo from './assets/bracu.png'

import './Nav.css'

function NavBar() {
  return (
    <>
      <nav className="navbar">
        <div className="navbar-inner">
          <div className="navbar-logo">
            <img src={bracuLogo} alt="Logo" />
          </div>
        </div>
      </nav>

      <nav className="sub-navbar"><div className='sub-box'>
      <p>Advising for Fall 2025</p>
      </div>
      </nav>
    </>
  );
}

  
  export default NavBar;
  