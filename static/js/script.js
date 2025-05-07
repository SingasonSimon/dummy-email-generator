// static/js/script.js

// --- Global variables ---
let currentEmailAddress = null;
let currentEmailObjects = []; 
let autoRefreshIntervalId = null; 
const AUTO_REFRESH_MILLISECONDS = 10000; 
const EMAILS_PER_PAGE_JS = 10; 
let currentPage = 1;
let isLoadingMore = false; 
let currentOpenEmailId = null; 

// --- DOMContentLoaded ---
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded and parsed.');
    setCurrentYear(); 

    // --- Get DOM elements ---
    const generateButton = document.getElementById('generate-email-btn');
    const customPrefixInput = document.getElementById('custom-prefix');
    const generatedEmailContainer = document.getElementById('generated-email-container');
    const generatedEmailDisplay = document.getElementById('generated-email');
    const copyEmailButton = document.getElementById('copy-email-btn');
    const copyStatusDisplay = document.getElementById('copy-status');

    const inboxSection = document.getElementById('inbox-section');
    const inboxEmailAddressDisplay = document.getElementById('inbox-email-address');
    const refreshInboxButton = document.getElementById('refresh-inbox-btn');
    const clearInboxButton = document.getElementById('clear-inbox-btn'); 
    const inboxContainer = document.getElementById('inbox-container');
    const noEmailsMessage = document.getElementById('no-emails-message');
    const fetchStatusDisplay = document.getElementById('fetch-status');
    
    const refreshIcon = document.getElementById('refresh-icon');
    const loadingSpinner = document.getElementById('loading-spinner');

    const loadMoreContainer = document.getElementById('load-more-container');
    const loadMoreButton = document.getElementById('load-more-btn');
    const loadMoreSpinner = document.getElementById('load-more-spinner');

    // Modal elements
    const emailDetailModal = document.getElementById('email-detail-modal');
    const closeModalButton = document.getElementById('close-modal-btn');
    const modalDeleteEmailButton = document.getElementById('modal-delete-email-btn'); 
    const modalEmailSubject = document.getElementById('modal-email-subject');
    const modalEmailFrom = document.getElementById('modal-email-from');
    const modalEmailTo = document.getElementById('modal-email-to');
    const modalEmailTimestamp = document.getElementById('modal-email-timestamp');
    const modalEmailBody = document.getElementById('modal-email-body');

    // Verify essential elements for copy functionality
    if (!generatedEmailDisplay) console.error("Script Error: generatedEmailDisplay element not found!");
    if (!copyEmailButton) console.error("Script Error: copyEmailButton element not found!");
    if (!copyStatusDisplay) console.error("Script Error: copyStatusDisplay element not found!");


    // --- Auto-refresh functions ---
    function startAutoRefresh() {
        stopAutoRefresh(); 
        if (currentEmailAddress) {
            autoRefreshIntervalId = setInterval(() => fetchEmails(false, false, true), AUTO_REFRESH_MILLISECONDS); 
            console.log(`Auto-refresh started for ${currentEmailAddress}, interval ID: ${autoRefreshIntervalId}`);
            if (fetchStatusDisplay) {
                 fetchStatusDisplay.textContent = `Auto-refresh active (every ${AUTO_REFRESH_MILLISECONDS / 1000}s).`;
                 setTimeout(() => {
                    if (fetchStatusDisplay && fetchStatusDisplay.textContent.includes('Auto-refresh active')) fetchStatusDisplay.textContent = '';
                 }, 3000);
            }
        }
    }

    function stopAutoRefresh() {
        if (autoRefreshIntervalId) {
            clearInterval(autoRefreshIntervalId);
            console.log(`Auto-refresh stopped, interval ID: ${autoRefreshIntervalId}`);
            autoRefreshIntervalId = null;
        }
    }

    // --- Helper function to show/hide loading spinner ---
    function showLoading(isLoading, isAutoRefresh = false, isLoadMoreOp = false) {
        if (isLoading) {
            if (isLoadMoreOp) {
                if (loadMoreButton) loadMoreButton.classList.add('hidden'); 
                if (loadMoreSpinner) loadMoreSpinner.classList.remove('hidden');
            } else { 
                if (refreshIcon) refreshIcon.classList.add('hidden');
                if (loadingSpinner) loadingSpinner.classList.remove('hidden');
                if (refreshInboxButton) refreshInboxButton.disabled = true;
                if (clearInboxButton) clearInboxButton.disabled = true; 
            }
            if (!isAutoRefresh && !isLoadMoreOp && fetchStatusDisplay) { 
                fetchStatusDisplay.textContent = 'Fetching emails...';
            }
        } else { 
            if (isLoadMoreOp) {
                if (loadMoreSpinner) loadMoreSpinner.classList.add('hidden');
            } else { 
                if (refreshIcon) refreshIcon.classList.remove('hidden');
                if (loadingSpinner) loadingSpinner.classList.add('hidden');
                if (refreshInboxButton) refreshInboxButton.disabled = false;
                if (clearInboxButton) clearInboxButton.disabled = false; 
            }
        }
    }
    
    // --- Function to fetch emails ---
    async function fetchEmails(isTriggeredByUser = false, isLoadMore = false, isAutoRefreshAction = false) { 
        console.log(`fetchEmails called. Current: ${currentEmailAddress}. User: ${isTriggeredByUser}. LoadMore: ${isLoadMore}. AutoRefresh: ${isAutoRefreshAction}. Page: ${currentPage}`);
        if (!currentEmailAddress) {
            if(fetchStatusDisplay) fetchStatusDisplay.textContent = 'No email address generated yet.';
            if(clearInboxButton) clearInboxButton.classList.add('hidden'); 
            stopAutoRefresh(); 
            return;
        }
        if (isLoadingMore && isLoadMore) { 
            console.log("Already loading more emails, request ignored.");
            return;
        }

        if (isLoadMore) {
            isLoadingMore = true;
        }

        showLoading(true, isAutoRefreshAction, isLoadMore); 

        try {
            let pageToFetch;
            if (isLoadMore) {
                pageToFetch = currentPage;
            } else { 
                pageToFetch = 1;
                if (isTriggeredByUser && !isAutoRefreshAction) { 
                    currentPage = 1; 
                    currentEmailObjects = []; 
                    if (inboxContainer) inboxContainer.innerHTML = ''; 
                    if (noEmailsMessage && inboxContainer && !inboxContainer.contains(noEmailsMessage) ) { 
                        noEmailsMessage.classList.remove('hidden');
                        inboxContainer.appendChild(noEmailsMessage);
                    }
                }
            }
            
            const response = await fetch(`/api/emails/${currentEmailAddress}?page=${pageToFetch}&limit=${EMAILS_PER_PAGE_JS}`);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: "Failed to parse error response." }));
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            console.log('fetchEmails: Data received:', data);

            if (data.success) {
                const newEmails = data.emails || [];
                let emailsChangedOrInitialLoad = false;

                if (isLoadMore) {
                    if (newEmails.length > 0) {
                        currentEmailObjects.push(...newEmails); 
                        displayEmails(newEmails, true); 
                        emailsChangedOrInitialLoad = true;
                    }
                } else { 
                    if (isTriggeredByUser || JSON.stringify(currentEmailObjects) !== JSON.stringify(newEmails)) {
                        currentEmailObjects = newEmails; 
                        displayEmails(currentEmailObjects, false); 
                        emailsChangedOrInitialLoad = true;
                    }
                }
                
                if (!emailsChangedOrInitialLoad && !isLoadMore) {
                     console.log('fetchEmails (user refresh or auto-refresh page 1): No changes in email data.');
                }

                if (isTriggeredByUser && fetchStatusDisplay) {
                    fetchStatusDisplay.textContent = currentEmailObjects.length > 0 ? 'Inbox updated.' : 'Inbox is empty.';
                }
                
                if (isAutoRefreshAction && fetchStatusDisplay) { 
                     const time = new Date().toLocaleTimeString();
                     fetchStatusDisplay.textContent = `Last checked: ${time}. Emails: ${currentEmailObjects.length}`;
                }

                if (loadMoreContainer && loadMoreButton) {
                    if (data.has_more) {
                        loadMoreContainer.classList.remove('hidden');
                        loadMoreButton.classList.remove('hidden'); 
                        currentPage = data.page + 1; 
                    } else {
                        loadMoreContainer.classList.add('hidden');
                    }
                }
            } else {
                if(fetchStatusDisplay) fetchStatusDisplay.textContent = data.message || 'Failed to load emails.';
                if (!isLoadMore) displayEmails([], false); 
                stopAutoRefresh(); 
            }
        } catch (error) {
            console.error('Error fetching emails:', error);
            if(fetchStatusDisplay) fetchStatusDisplay.textContent = `Error: ${error.message}`;
            if (!isLoadMore) displayEmails([], false);
            stopAutoRefresh(); 
        } finally {
            showLoading(false, isAutoRefreshAction, isLoadMore);
            if (isLoadMore) isLoadingMore = false;

            if (isTriggeredByUser && fetchStatusDisplay) {
                setTimeout(() => {
                    if (fetchStatusDisplay && (fetchStatusDisplay.textContent.includes('updated') || fetchStatusDisplay.textContent.includes('empty'))) {
                        fetchStatusDisplay.textContent = '';
                    }
                }, 3000);
            }
        }
    }

    // --- Function to display emails in the inbox ---
    function displayEmails(emailsToRenderParam, isAppending = false) {
        const emailsToActuallyRender = isAppending ? emailsToRenderParam : currentEmailObjects;
        console.log('displayEmails called. Appending:', isAppending, 'Emails to render now:', emailsToActuallyRender.length, 'Total in currentEmailObjects:', currentEmailObjects.length);
        
        if (!inboxContainer) {
            console.error("displayEmails: inboxContainer is null!");
            return;
        }
        
        if (!isAppending) {
            inboxContainer.innerHTML = ''; 
        }

        if (currentEmailObjects.length === 0) { 
            if(noEmailsMessage) {
                noEmailsMessage.classList.remove('hidden');
                if (!inboxContainer.contains(noEmailsMessage)) {
                    inboxContainer.appendChild(noEmailsMessage);
                }
            }
            if(clearInboxButton) clearInboxButton.classList.add('hidden'); 
        } else {
            if(noEmailsMessage) noEmailsMessage.classList.add('hidden'); 
            if(clearInboxButton) clearInboxButton.classList.remove('hidden'); 
            
            emailsToActuallyRender.forEach((email) => {
                if (isAppending && inboxContainer.querySelector(`[data-email-id="${email.id}"]`)) {
                    return; 
                }

                const emailDiv = document.createElement('div');
                emailDiv.className = 'email-item group flex items-center p-3 sm:p-4 mb-3 bg-white hover:bg-gray-100 border border-gray-200 rounded-lg shadow-sm cursor-pointer transition-all duration-150 ease-in-out relative';
                emailDiv.setAttribute('data-email-id', email.id); 
                const subject = email.subject || '(No Subject)';
                const from = email.from || '(Unknown Sender)';
                const timestamp = new Date(email.timestamp).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                
                emailDiv.innerHTML = `
                    <div class="flex-shrink-0 mr-3 sm:mr-4">
                        <div class="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-primary text-white flex items-center justify-center text-lg sm:text-xl font-semibold">
                            ${escapeHTML(from.charAt(0).toUpperCase())}
                        </div>
                    </div>
                    <div class="flex-grow overflow-hidden" data-action="open-modal">
                        <div class="flex justify-between items-baseline">
                            <h4 class="text-sm sm:text-base font-semibold text-gray-800 truncate" title="${escapeHTML(subject)}">${escapeHTML(subject)}</h4>
                            <span class="text-xs text-gray-500 flex-shrink-0 ml-2">${escapeHTML(timestamp)}</span>
                        </div>
                        <p class="text-xs sm:text-sm text-gray-600 truncate">From: ${escapeHTML(from)}</p>
                    </div>
                    <button class="delete-one-email-btn absolute top-2 right-2 p-1 bg-red-100 text-danger hover:bg-red-200 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-150" title="Delete this email">
                        <svg class="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                `;
                
                const openModalPart = emailDiv.querySelector('[data-action="open-modal"]');
                if (openModalPart) {
                    openModalPart.addEventListener('click', () => {
                        console.log(`Email item (content) clicked. ID: ${email.id}`);
                        openEmailModal(email.id);
                    });
                }

                const deleteOneBtn = emailDiv.querySelector('.delete-one-email-btn');
                if (deleteOneBtn) {
                    deleteOneBtn.addEventListener('click', (event) => {
                        event.stopPropagation(); 
                        handleDeleteOneEmail(email.id, email.subject);
                    });
                }
                inboxContainer.appendChild(emailDiv); 
            });
        }
    }

    // --- Function to handle deleting a single email ---
    async function handleDeleteOneEmail(emailId, emailSubject) {
        if (!confirm(`Are you sure you want to delete the email: "${emailSubject || 'this email'}"?`)) {
            return;
        }
        console.log(`Attempting to delete email ID: ${emailId}`);
        try {
            const response = await fetch(`/api/email/${emailId}`, { method: 'DELETE' });
            const data = await response.json();

            if (response.ok && data.success) {
                console.log('Email deleted successfully from server:', data.message);
                fetchStatusDisplay.textContent = data.message;
                currentEmailObjects = currentEmailObjects.filter(email => email.id !== emailId);
                displayEmails(currentEmailObjects, false); // Re-render: displayEmails will check currentEmailObjects.length for clearInboxButton
                if (currentOpenEmailId === emailId) { 
                    closeEmailModal();
                }
            } else {
                console.error('Failed to delete email:', data.message);
                fetchStatusDisplay.textContent = `Error: ${data.message || 'Could not delete email.'}`;
            }
        } catch (error) {
            console.error('Error during delete request:', error);
            fetchStatusDisplay.textContent = 'Error: Could not connect to server to delete email.';
        }
        setTimeout(() => { if (fetchStatusDisplay) fetchStatusDisplay.textContent = ''; }, 3000);
    }

    // --- Function to handle clearing the entire inbox ---
    async function handleClearInbox() {
        if (!currentEmailAddress) {
            fetchStatusDisplay.textContent = 'No email address selected.';
            return;
        }
        if (currentEmailObjects.length === 0) { 
            fetchStatusDisplay.textContent = 'Inbox is already empty.';
            setTimeout(() => { if (fetchStatusDisplay) fetchStatusDisplay.textContent = ''; }, 3000);
            return;
        }
        if (!confirm(`Are you sure you want to delete ALL emails for ${currentEmailAddress}? This cannot be undone.`)) {
            return;
        }
        console.log(`Attempting to clear inbox for: ${currentEmailAddress}`);
        try {
            const response = await fetch(`/api/emails/${currentEmailAddress}/clear`, { method: 'DELETE' });
            const data = await response.json();

            if (response.ok && data.success) {
                console.log('Inbox cleared successfully:', data.message);
                fetchStatusDisplay.textContent = data.message;
                currentEmailObjects = []; 
                currentPage = 1; 
                displayEmails([], false); 
                if (loadMoreContainer) loadMoreContainer.classList.add('hidden'); 
                // clearInboxButton is handled by displayEmails
                closeEmailModal(); 
            } else {
                console.error('Failed to clear inbox:', data.message);
                fetchStatusDisplay.textContent = `Error: ${data.message || 'Could not clear inbox.'}`;
            }
        } catch (error) {
            console.error('Error during clear inbox request:', error);
            fetchStatusDisplay.textContent = 'Error: Could not connect to server to clear inbox.';
        }
        setTimeout(() => { if (fetchStatusDisplay) fetchStatusDisplay.textContent = ''; }, 3000);
    }


    // --- Function to open/close modal, copy, helpers ---
    function openEmailModal(emailId) { 
        const email = currentEmailObjects.find(e => e.id === emailId);
        if (!email) return;
        currentOpenEmailId = emailId; 
        if(modalEmailSubject) modalEmailSubject.textContent = email.subject || '(No Subject)';
        if(modalEmailFrom) modalEmailFrom.textContent = email.from || '(Unknown Sender)';
        if(modalEmailTo) modalEmailTo.textContent = currentEmailAddress; 
        if(modalEmailTimestamp) modalEmailTimestamp.textContent = new Date(email.timestamp).toLocaleString();
        const emailBodyContent = email.body || '(No Body)';
        if (modalEmailBody) {
            if (isHTML(emailBodyContent)) modalEmailBody.innerHTML = emailBodyContent; 
            else modalEmailBody.innerHTML = `<div style="white-space: pre-wrap;">${escapeHTML(emailBodyContent)}</div>`;
        }
        if(emailDetailModal) emailDetailModal.classList.remove('hidden');
    }
    function closeEmailModal() { 
        currentOpenEmailId = null; 
        if(emailDetailModal) emailDetailModal.classList.add('hidden');
        if(modalEmailSubject) modalEmailSubject.textContent = '';
        if(modalEmailFrom) modalEmailFrom.textContent = '';
        if(modalEmailTo) modalEmailTo.textContent = '';
        if(modalEmailTimestamp) modalEmailTimestamp.textContent = '';
        if(modalEmailBody) modalEmailBody.innerHTML = '';
    }
    
    // --- Fallback copy function ---
    function tryFallbackCopy(textToCopy) { 
        console.log('Attempting fallback copy method.');
        const textArea = document.createElement("textarea");
        textArea.value = textToCopy;
        textArea.style.top = "0"; textArea.style.left = "0"; textArea.style.position = "fixed";
        document.body.appendChild(textArea);
        textArea.focus(); textArea.select();
        try {
            const successful = document.execCommand('copy');
            if (successful) {
                console.log('Successfully copied to clipboard (fallback).');
                copyStatusDisplay.textContent = 'Copied! (fallback)';
                copyStatusDisplay.classList.remove('text-red-500');
                copyStatusDisplay.classList.add('text-green-600');
            } else {
                console.error('Fallback copy command was not successful.');
                copyStatusDisplay.textContent = 'Copy failed (fallback)';
                copyStatusDisplay.classList.remove('text-green-600');
                copyStatusDisplay.classList.add('text-red-500');
            }
        } catch (err) {
            console.error('Error during fallback copy:', err);
            copyStatusDisplay.textContent = 'Copy error (fallback)';
            copyStatusDisplay.classList.remove('text-green-600');
            copyStatusDisplay.classList.add('text-red-500');
        }
        document.body.removeChild(textArea);
        setTimeout(() => { if(copyStatusDisplay) copyStatusDisplay.textContent = ''; }, 2000);
    }
    
    function setCurrentYear() { 
        const yearSpan = document.getElementById('current-year');
        if (yearSpan) yearSpan.textContent = new Date().getFullYear();
    }
    function escapeHTML(str) { 
        if (str === null || str === undefined) return '';
        return str.toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }
    function isHTML(str) { 
        if (str === null || str === undefined) return false;
        try {
            const doc = new DOMParser().parseFromString(str, "text/html");
            return Array.from(doc.body.childNodes).some(node => node.nodeType === 1);
        } catch (e) { return false; }
    }


    // --- Event listener for the generate email button ---
    if (generateButton) {
        generateButton.addEventListener('click', async () => {
            console.log('Generate Email button clicked.');
            stopAutoRefresh(); 
            currentPage = 1; 
            currentEmailObjects = []; 
            if (inboxContainer) inboxContainer.innerHTML = ''; 
            if (loadMoreContainer) loadMoreContainer.classList.add('hidden'); 
            if (clearInboxButton) clearInboxButton.classList.add('hidden'); 
            if (noEmailsMessage && inboxContainer && !inboxContainer.contains(noEmailsMessage) ) { 
                noEmailsMessage.classList.remove('hidden');
                inboxContainer.appendChild(noEmailsMessage);
            }

            const prefixValue = customPrefixInput.value.trim();
            if(copyStatusDisplay) copyStatusDisplay.textContent = ''; 
            if(fetchStatusDisplay) fetchStatusDisplay.textContent = ''; 

            try {
                const response = await fetch('/api/generate-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prefix: prefixValue }),
                });
                const data = await response.json();

                if (data.success && data.email) {
                    currentEmailAddress = data.email; 
                    if(generatedEmailDisplay) generatedEmailDisplay.textContent = currentEmailAddress;
                    if(generatedEmailContainer) {
                        generatedEmailContainer.classList.remove('hidden');
                        generatedEmailContainer.classList.add('flex', 'flex-col', 'items-center');
                    }
                    if(inboxEmailAddressDisplay) inboxEmailAddressDisplay.textContent = currentEmailAddress;
                    if(inboxSection) inboxSection.classList.remove('hidden');
                    
                    await fetchEmails(true, false, false); 
                    startAutoRefresh(); 
                } else {
                    if(generatedEmailDisplay) generatedEmailDisplay.textContent = 'Error generating email.';
                    if(inboxSection) inboxSection.classList.add('hidden');
                }
            } catch (error) {
                console.error('Error in generate email process:', error);
                if(generatedEmailDisplay) generatedEmailDisplay.textContent = `Error: ${error.message}`;
                if(inboxSection) inboxSection.classList.add('hidden');
            }
        });
    }

    // --- Event listener for the copy email button ---
     if (copyEmailButton) {
        copyEmailButton.addEventListener('click', () => { 
            console.log('Copy Email button clicked.'); // Ensure this log is present
            if (!generatedEmailDisplay || !copyStatusDisplay) {
                console.error('Copy function: Missing generatedEmailDisplay or copyStatusDisplay element.');
                return;
            }

            const emailToCopy = generatedEmailDisplay.textContent;
            console.log('Email to copy:', emailToCopy);

            if (emailToCopy) {
                if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                    console.log('Attempting to copy using navigator.clipboard.writeText');
                    navigator.clipboard.writeText(emailToCopy)
                        .then(() => { 
                            console.log('Successfully copied to clipboard (navigator).');
                            copyStatusDisplay.textContent = 'Copied!';
                            copyStatusDisplay.classList.remove('text-red-500');
                            copyStatusDisplay.classList.add('text-green-600');
                            setTimeout(() => { if(copyStatusDisplay) copyStatusDisplay.textContent = ''; }, 2000);
                         })
                        .catch(err => { 
                            console.error('Failed to copy using navigator.clipboard.writeText:', err);
                            tryFallbackCopy(emailToCopy); 
                        });
                } else { 
                    console.log('navigator.clipboard.writeText not available. Trying fallback method.');
                    tryFallbackCopy(emailToCopy); 
                }
            } else {
                console.warn('Nothing to copy, email display is empty.');
                copyStatusDisplay.textContent = 'Nothing to copy.';
                copyStatusDisplay.classList.remove('text-green-600');
                copyStatusDisplay.classList.add('text-red-500');
                setTimeout(() => { if(copyStatusDisplay) copyStatusDisplay.textContent = ''; }, 2000);
            }
        });
    }

    // --- Event listener for the refresh inbox button ---
    if (refreshInboxButton) {
        refreshInboxButton.addEventListener('click', () => fetchEmails(true, false, false));
    }

    // --- Event listener for the "Load More" button ---
    if (loadMoreButton) {
        loadMoreButton.addEventListener('click', () => fetchEmails(false, true, false)); 
    }
    
    // --- Event listener for "Clear All Emails" button ---
    if (clearInboxButton) {
        clearInboxButton.addEventListener('click', handleClearInbox);
    }

    // --- Event listener for "Delete This Email" button in Modal ---
    if (modalDeleteEmailButton) {
        modalDeleteEmailButton.addEventListener('click', () => {
            if (currentOpenEmailId) {
                const emailToDelete = currentEmailObjects.find(e => e.id === currentOpenEmailId);
                handleDeleteOneEmail(currentOpenEmailId, emailToDelete ? emailToDelete.subject : 'this email');
            } else {
                console.warn("Modal delete clicked, but no currentOpenEmailId set.");
            }
        });
    }
    
    if (closeModalButton) closeModalButton.addEventListener('click', closeEmailModal);
    if (emailDetailModal) emailDetailModal.addEventListener('click', (event) => { if (event.target === emailDetailModal) closeEmailModal(); });
    
    const buttons = document.querySelectorAll('button');
    buttons.forEach(button => { 
        button.addEventListener('mousedown', () => button.classList.add('transform', 'scale-95'));
        button.addEventListener('mouseup', () => button.classList.remove('transform', 'scale-95'));
        button.addEventListener('mouseleave', () => button.classList.remove('transform', 'scale-95'));
     });
    console.log("Initial setup complete. Event listeners attached.");
});
