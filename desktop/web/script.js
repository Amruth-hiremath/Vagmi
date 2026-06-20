document.addEventListener("DOMContentLoaded", () => {
    // Configuration
    const PAGE_MAP = {
      home: "./pages/home/index.html",
      intelligence: "./pages/intelligence/index.html",
      chat: "./pages/chat/index.html",
      settings: "./pages/settings/index.html",
      auth: "./pages/auth/index.html",
    };
  
    const DEFAULT_PAGE = "auth";
    const sidebarStateKey = "vagmi-sidebar-collapsed";
    const activePageKey = "vagmi-active-shell-page";
  
    // DOM Elements
    const pageFrame = document.getElementById("page-frame");
    const navItems = Array.from(document.querySelectorAll(".nav-item"));
    const sidebarToggle = document.getElementById("sidebar-toggle");
  
    // ==========================================
    // 1. Sidebar Toggle Logic
    // ==========================================
    function setSidebarCollapsed(collapsed) {
      if (collapsed) {
        document.body.classList.add("sidebar-collapsed");
      } else {
        document.body.classList.remove("sidebar-collapsed");
      }
      localStorage.setItem(sidebarStateKey, collapsed ? "1" : "0");
    }
  
    sidebarToggle.addEventListener("click", () => {
      const isCollapsed = document.body.classList.contains("sidebar-collapsed");
      setSidebarCollapsed(!isCollapsed);
    });
  
    // Restore saved sidebar state on load
    const savedCollapsed = localStorage.getItem(sidebarStateKey) === "1";
    setSidebarCollapsed(savedCollapsed);
  
    // ==========================================
    // 2. Navigation Routing Logic
    // ==========================================
    function setActivePage(page) {
      if (!PAGE_MAP[page]) page = DEFAULT_PAGE;
  
      // Update UI active state on the buttons
      navItems.forEach((item) => {
        if (item.dataset.page === page) {
          item.classList.add("active");
        } else {
          item.classList.remove("active");
        }
      });
  
      // Securely update the iframe source if different
      const targetUrl = new URL(PAGE_MAP[page], window.location.href).href;
      if (pageFrame.src !== targetUrl) {
        pageFrame.src = targetUrl;
      }
  
      localStorage.setItem(activePageKey, page);
    }
  
    // Bind click events to navigation buttons
    navItems.forEach((btn) => {
      btn.addEventListener("click", () => setActivePage(btn.dataset.page));
    });
  
    // Restore saved page on load
    const savedPage = localStorage.getItem(activePageKey) || DEFAULT_PAGE;
    setActivePage(savedPage);

    // ==========================================
    // 3. Iframe Message Bridge
    // ==========================================
    // Allows inner pages to trigger shell navigation or sidebar toggling
    window.addEventListener("message", (event) => {
      const data = event.data || {};
      
      if (data.type === "navigate" && data.page) {
        setActivePage(data.page);
      }
      
      if (data.type === "set-sidebar-collapsed") {
        setSidebarCollapsed(Boolean(data.collapsed));
      }
    });
});