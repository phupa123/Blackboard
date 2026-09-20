// Page Transition Script for BlackBoard
// Provides smooth fade out when switching pages and instant fade in on arrival
(function() {
    document.addEventListener('DOMContentLoaded', () => {
        // 1. Ensure the transition curtain element exists
        let transitionCurtain = document.getElementById('bb-page-transition');
        if (!transitionCurtain) {
            transitionCurtain = document.createElement('div');
            transitionCurtain.id = 'bb-page-transition';
            document.body.prepend(transitionCurtain);
        }

        // 2. If loaded after a navigation fade, fade out the curtain to reveal content
        requestAnimationFrame(() => {
            transitionCurtain.classList.remove('is-active');
        });

        // 3. Intercept internal page navigation links
        document.addEventListener('click', (e) => {
            const anchor = e.target.closest('a');
            if (!anchor) return;

            const href = anchor.getAttribute('href');
            if (!href) return;

            // Ignore hash-only anchors (#aboutSection etc), javascript:, mailto:, tel:
            if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
                return;
            }

            // Ignore external links or links opening in a new tab
            if (anchor.target === '_blank' || anchor.hasAttribute('download')) {
                return;
            }

            const targetUrl = new URL(href, window.location.href);

            // Only transition between pages on the same origin / relative paths (.html)
            if (targetUrl.origin === window.location.origin) {
                // If clicking the same current page without hash change, do nothing
                if (targetUrl.pathname === window.location.pathname && targetUrl.search === window.location.search && !targetUrl.hash) {
                    return;
                }

                e.preventDefault();
                sessionStorage.setItem('bb_nav_transition', '1');
                transitionCurtain.classList.add('is-active');

                // Navigate after smooth fade transition duration (300ms)
                setTimeout(() => {
                    window.location.href = href;
                }, 300);
            }
        });
    });

    // In case user hits Back/Forward button (bfcache restoration)
    window.addEventListener('pageshow', (event) => {
        const transitionCurtain = document.getElementById('bb-page-transition');
        if (transitionCurtain) {
            transitionCurtain.classList.remove('is-active');
        }
    });
})();
