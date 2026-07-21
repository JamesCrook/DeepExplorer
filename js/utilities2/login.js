
document.addEventListener('DOMContentLoaded', function() {
  const loginLink = document.getElementById('login-link');
  
  if (loginLink) {
    const userMenuHTML = `
        <!-- Logged in state (hidden by default) -->
        <div class="user-menu" id="user-menu" style="display: none;">
          <button class="user-menu-button" id="user-menu-button">
            <span class="user-avatar">GU</span>
            <span>▾</span>
          </button>
          <div class="user-menu-dropdown">
            <div class="menu-header">
              <div class="name">Guest User</div>
              <div class="email">guest@example.com</div>
              <span class="badge">Free Account</span>
            </div>
            <a href="#">Account settings</a>
            <a href="#">Billing &amp; invoices</a>
            <div class="menu-divider"></div>
            <a href="#" class="logout" id="logout-link">Log out</a>
          </div>
        </div>`;
    
    loginLink.insertAdjacentHTML('afterend', userMenuHTML);
  }

  // Login state management
  let isLoggedIn = false;
  const userMenu = document.getElementById('user-menu');
  const userMenuButton = document.getElementById('user-menu-button');
  const logoutLink = document.getElementById('logout-link');
  const subscriberDefault = document.getElementById('subscriber-default');
  const subscriberActive = document.getElementById('subscriber-active');
  
  function updateLoginStateInternal() {
    if (isLoggedIn) {
      loginLink.style.display = 'none';
      userMenu.style.display = 'block';
      subscriberDefault.style.display = 'none';
      subscriberActive.style.display = 'flex';
    } else {
      loginLink.style.display = 'block';
      userMenu.style.display = 'none';
      subscriberDefault.style.display = 'flex';
      subscriberActive.style.display = 'none';
      userMenu.classList.remove('open');
    }
  }
  
  loginLink.addEventListener('click', (e) => {
    e.preventDefault();
    isLoggedIn = true;
    updateLoginStateInternal();
  });
  
  logoutLink.addEventListener('click', (e) => {
    e.preventDefault();
    isLoggedIn = false;
    updateLoginStateInternal();
  });
  
  userMenuButton.addEventListener('click', () => {
    userMenu.classList.toggle('open');
  });
  
  // Close menu when clicking outside
  document.addEventListener('click', (e) => {
    if (!userMenu.contains(e.target)) {
      userMenu.classList.remove('open');
    }
  });

});
    