import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
// Import assets directly - this tells Vite to include and process them
import strategyCardUrl from './assets/strategy-card.jpg';
import foxImageUrl from './assets/blackjack-fox.png';

// Constants
const TABLE_WIDTH = 20;
const TABLE_DEPTH = 10;
const CARD_WIDTH = 0.7;
const CARD_HEIGHT = 1;
const CARD_DEPTH = 0.01;

// Game state variables
let scene, camera, renderer, controls;
let deck = [];
let playerHands = [[]]; // Multiple hands for splitting
let dealerHand = [];
let currentHandIndex = 0;
let gameState = 'betting'; // 'betting', 'playerTurn', 'dealerTurn', 'gameOver'
let foxModel;
let message = "";
let using2DFallback = false;
let canvas2D, ctx2D;

// Card texture loader
const textureLoader = new THREE.TextureLoader();

// DOM elements
let moneyDisplay, betDisplay, messageArea, hitButton, standButton, doubleButton, 
    splitButton, newGameButton, decreaseBetButton, increaseBetButton, 
    betAmountDisplay, strategyToggle, strategyCard, debugElement;

// Betting system variables
let money = 1000;
let currentBet = 100;
let bets = [100]; // Bet for each hand when splitting

// Global variables for 2D mode
let foxImage = null;

// Check for WebGL support
function isWebGLAvailable() {
    try {
        const canvas = document.createElement('canvas');
        return !!(window.WebGLRenderingContext && 
            (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
    } catch (e) {
        return false;
    }
}

// Wait for DOM to be fully loaded before initializing
document.addEventListener('DOMContentLoaded', () => {
    // Now initialize UI elements
    moneyDisplay = document.getElementById('money-display');
    betDisplay = document.getElementById('bet-display');
    messageArea = document.getElementById('message-area');
    hitButton = document.getElementById('hit-button');
    standButton = document.getElementById('stand-button');
    doubleButton = document.getElementById('double-button');
    splitButton = document.getElementById('split-button');
    newGameButton = document.getElementById('new-game-button');
    decreaseBetButton = document.getElementById('decrease-bet');
    increaseBetButton = document.getElementById('increase-bet');
    betAmountDisplay = document.getElementById('bet-amount');
    strategyToggle = document.getElementById('strategy-toggle');
    strategyCard = document.getElementById('strategy-card');
    debugElement = document.getElementById('debug');
    
    // Show debug info
    debugElement.style.display = 'block';
    debugElement.textContent = 'Initializing game...';
    
    // Check WebGL support
    if (!isWebGLAvailable()) {
        debugElement.textContent = 'WebGL not supported. Using 2D canvas fallback.';
        using2DFallback = true;
        init2D();
    } else {
        debugElement.textContent = 'WebGL supported. Initializing 3D scene.';
        // Initialize the 3D game
        try {
            init3D();
            animate();
        } catch (e) {
            console.error('Error initializing 3D scene:', e);
            debugElement.textContent = 'Error initializing 3D scene. Using 2D canvas fallback.';
            using2DFallback = true;
            init2D();
        }
    }
    
    // Set up event listeners for buttons (these work regardless of rendering method)
    if (hitButton) hitButton.addEventListener('click', hit);
    if (standButton) standButton.addEventListener('click', stand);
    if (doubleButton) doubleButton.addEventListener('click', doubleDown);
    if (splitButton) splitButton.addEventListener('click', split);
    if (newGameButton) newGameButton.addEventListener('click', newGame);
    if (decreaseBetButton) decreaseBetButton.addEventListener('click', decreaseBet);
    if (increaseBetButton) increaseBetButton.addEventListener('click', increaseBet);
    if (strategyToggle) strategyToggle.addEventListener('click', toggleStrategyCard);
    
    // Set up strategy card
    if (strategyCard) {
        strategyCard.src = strategyCardUrl;
        strategyCard.onload = () => {
            console.log('Strategy card loaded successfully');
        };
        strategyCard.onerror = () => {
            console.error('Error loading strategy card');
        };
    }
    
    // Set initial game state
    gameState = 'betting';
    updateUI();
    setButtonStates();
});

// Initialize 2D canvas as fallback
function init2D() {
    const canvasContainer = document.getElementById('canvas');
    if (!canvasContainer) {
        console.error('Canvas container not found');
        return;
    }
    
    // Create a 2D canvas
    canvas2D = document.createElement('canvas');
    canvas2D.width = window.innerWidth;
    canvas2D.height = window.innerHeight;
    canvas2D.style.width = '100%';
    canvas2D.style.height = '100%';
    canvasContainer.appendChild(canvas2D);
    
    ctx2D = canvas2D.getContext('2d');
    
    // Preload fox image
    foxImage = new Image();
    foxImage.src = foxImageUrl;
    foxImage.onload = () => {
        console.log('Fox image loaded successfully');
        // Force a redraw once the image is loaded
        render2D();
    };
    foxImage.onerror = (err) => {
        console.error('Error loading fox image:', err);
    };
    
    // Handle window resize
    window.addEventListener('resize', () => {
        canvas2D.width = window.innerWidth;
        canvas2D.height = window.innerHeight;
        render2D();
    });
    
    // Start animation loop
    render2D();
    
    console.log('2D fallback initialized');
}

// Render the 2D scene
function render2D() {
    if (!ctx2D) return;
    
    // Clear canvas
    ctx2D.fillStyle = '#004400';
    ctx2D.fillRect(0, 0, canvas2D.width, canvas2D.height);
    
    // Draw table
    const tableWidth = canvas2D.width * 0.8;
    const tableHeight = canvas2D.height * 0.7;
    const tableX = (canvas2D.width - tableWidth) / 2;
    const tableY = (canvas2D.height - tableHeight) / 2;
    
    ctx2D.fillStyle = '#009900';
    ctx2D.fillRect(tableX, tableY, tableWidth, tableHeight);
    
    ctx2D.strokeStyle = '#663300';
    ctx2D.lineWidth = 10;
    ctx2D.strokeRect(tableX, tableY, tableWidth, tableHeight);
    
    // Draw dealer area
    if (foxImage && foxImage.complete) {
        ctx2D.drawImage(foxImage, canvas2D.width / 2 - 50, tableY + 20, 100, 100);
    } else {
        // Draw placeholder if image not loaded
        ctx2D.fillStyle = '#ff9900';
        ctx2D.fillRect(canvas2D.width / 2 - 50, tableY + 20, 100, 100);
    }
    
    // Draw "Dealer" text
    ctx2D.fillStyle = 'white';
    ctx2D.font = '20px Arial';
    ctx2D.textAlign = 'center';
    ctx2D.fillText('Dealer', canvas2D.width / 2, tableY + 140);
    
    // Draw cards if game is in progress
    if (gameState !== 'betting') {
        // Draw dealer cards
        dealerHand.forEach((card, index) => {
            draw2DCard(card, canvas2D.width / 2 - 70 + index * 40, tableY + 150, card.faceUp);
        });
        
        // Draw player cards
        playerHands.forEach((hand, handIndex) => {
            const handOffsetX = handIndex * 150 - (playerHands.length - 1) * 75;
            
            hand.forEach((card, cardIndex) => {
                draw2DCard(card, canvas2D.width / 2 + handOffsetX + cardIndex * 40, tableY + tableHeight - 150, true);
            });
            
            // Draw hand value
            ctx2D.fillStyle = 'white';
            ctx2D.font = '18px Arial';
            ctx2D.textAlign = 'center';
            ctx2D.fillText(`Hand ${handIndex + 1}: ${getHandValue(hand)}`, 
                canvas2D.width / 2 + handOffsetX, tableY + tableHeight - 80);
        });
    }
    
    // Add debug info
    if (debugElement) {
        debugElement.textContent = `WebGL not supported. Using 2D canvas fallback.`;
    }
    
    // Request next frame
    requestAnimationFrame(render2D);
}

// Draw a 2D card
function draw2DCard(card, x, y, faceUp) {
    if (!ctx2D) return;
    
    // Card dimensions
    const cardWidth = 60;
    const cardHeight = 90;
    
    // Draw card background
    ctx2D.fillStyle = faceUp ? 'white' : '#cc0000';
    ctx2D.strokeStyle = 'black';
    ctx2D.lineWidth = 1;
    
    // Draw rounded rectangle
    ctx2D.beginPath();
    ctx2D.moveTo(x + 5, y);
    ctx2D.lineTo(x + cardWidth - 5, y);
    ctx2D.quadraticCurveTo(x + cardWidth, y, x + cardWidth, y + 5);
    ctx2D.lineTo(x + cardWidth, y + cardHeight - 5);
    ctx2D.quadraticCurveTo(x + cardWidth, y + cardHeight, x + cardWidth - 5, y + cardHeight);
    ctx2D.lineTo(x + 5, y + cardHeight);
    ctx2D.quadraticCurveTo(x, y + cardHeight, x, y + cardHeight - 5);
    ctx2D.lineTo(x, y + 5);
    ctx2D.quadraticCurveTo(x, y, x + 5, y);
    ctx2D.closePath();
    
    ctx2D.fill();
    ctx2D.stroke();
    
    // If face up, draw card value, otherwise draw card back pattern
    if (faceUp) {
        // Face up - show card value
        const displayValue = card.rank + card.suit;
        ctx2D.fillStyle = (card.suit === '♥' || card.suit === '♦') ? 'red' : 'black';
        ctx2D.font = '16px Arial';
        ctx2D.textAlign = 'center';
        ctx2D.textBaseline = 'middle';
        ctx2D.fillText(displayValue, x + cardWidth / 2, y + cardHeight / 2);
        
        // Draw smaller value at corners
        ctx2D.font = '12px Arial';
        ctx2D.fillText(displayValue, x + 10, y + 10);
        ctx2D.fillText(displayValue, x + cardWidth - 10, y + cardHeight - 10);
    } else {
        // Face down - draw card back pattern
        ctx2D.fillStyle = '#880000';
        ctx2D.fillRect(x + 5, y + 5, cardWidth - 10, cardHeight - 10);
        
        // Draw pattern
        ctx2D.fillStyle = '#cc0000';
        ctx2D.font = 'bold 16px Arial';
        ctx2D.textAlign = 'center';
        ctx2D.textBaseline = 'middle';
        ctx2D.fillText('♠♣♥♦', x + cardWidth / 2, y + cardHeight / 2);
    }
}

// Initialize the 3D scene
function init3D() {
    console.log('Initializing 3D game...');
    
    // Set up Three.js scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x004400);

    // Set up camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 10, 8);
    camera.lookAt(0, 0, 0);

    // Set up renderer with explicit context attributes
    const contextAttributes = {
        alpha: true,
        antialias: true,
        powerPreference: 'default',
        failIfMajorPerformanceCaveat: false
    };
    
    renderer = new THREE.WebGLRenderer({ 
        antialias: true,
        canvas: document.createElement('canvas'),
        context: null,
        precision: 'highp',
        powerPreference: 'default',
        alpha: true,
        stencil: false
    });
    
    renderer.setSize(window.innerWidth, window.innerHeight);
    const canvasContainer = document.getElementById('canvas');
    if (canvasContainer) {
        canvasContainer.appendChild(renderer.domElement);
    } else {
        console.error('Canvas container not found');
        document.body.appendChild(renderer.domElement);
    }

    // Add lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7);
    scene.add(directionalLight);

    // Add table
    createTable();

    // Set up dealer fox
    loadFoxModel();
    
    // Log that fox model has been loaded
    console.log('Fox model loaded');

    // Add controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 3;
    controls.maxDistance = 15;
    controls.maxPolarAngle = Math.PI / 2;

    // Handle window resize
    window.addEventListener('resize', onWindowResize);
    
    console.log('3D game initialization complete');
}

// Load the fox model (using a simple cube as placeholder)
function loadFoxModel() {
    // Create a simple 3D dealer using a textured cube (placeholder for a proper model)
    const foxTexture = textureLoader.load(foxImageUrl, 
        // Success callback
        function(texture) {
            console.log('Fox texture loaded successfully');
            const foxGeometry = new THREE.BoxGeometry(1, 1, 0.1);
            const foxMaterial = new THREE.MeshStandardMaterial({ map: texture });
            foxModel = new THREE.Mesh(foxGeometry, foxMaterial);
            foxModel.position.set(0, 0.5, -3);
            foxModel.scale.set(2, 2, 1);
            scene.add(foxModel);
        },
        // Progress callback
        undefined,
        // Error callback
        function(err) {
            console.error('Error loading fox texture:', err);
            // Fallback to a colored cube
            const foxGeometry = new THREE.BoxGeometry(1, 1, 0.1);
            const foxMaterial = new THREE.MeshStandardMaterial({ color: 0xff9900 });
            foxModel = new THREE.Mesh(foxGeometry, foxMaterial);
            foxModel.position.set(0, 0.5, -3);
            foxModel.scale.set(2, 2, 1);
            scene.add(foxModel);
        }
    );
}

// Create the table
function createTable() {
    const tableGeometry = new THREE.BoxGeometry(TABLE_WIDTH, 0.1, TABLE_DEPTH);
    const tableMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x009900,
        roughness: 0.8
    });
    const table = new THREE.Mesh(tableGeometry, tableMaterial);
    table.position.y = -0.05;
    scene.add(table);

    // Add table edge
    const edgeGeometry = new THREE.BoxGeometry(TABLE_WIDTH + 0.5, 0.2, TABLE_DEPTH + 0.5);
    const edgeMaterial = new THREE.MeshStandardMaterial({ color: 0x663300 });
    const edge = new THREE.Mesh(edgeGeometry, edgeMaterial);
    edge.position.y = -0.15;
    scene.add(edge);
}

// Handle window resize
function onWindowResize() {
    if (using2DFallback) return;
    
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Animation loop for 3D
function animate() {
    if (using2DFallback) return;
    
    requestAnimationFrame(animate);
    if (controls) controls.update();
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}

// Card class to represent each card
class Card {
    constructor(suit, rank, object3D = null) {
        this.suit = suit;
        this.rank = rank;
        this.object3D = object3D;
        this.faceUp = true;
    }
  
    // Return the card's value
    getValue() {
        if (['J', 'Q', 'K'].includes(this.rank)) return 10;
        if (this.rank === 'A') return 11;
        return parseInt(this.rank);
    }
  
    // Create a 3D card model
    create3DModel() {
        if (using2DFallback) return this;
        
        const cardGeometry = new THREE.BoxGeometry(CARD_WIDTH, CARD_HEIGHT, CARD_DEPTH);
        
        // Create materials for front and back of card
        const materials = [];
        
        // Front face (card value)
        const frontMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xffffff,
            side: THREE.FrontSide,
            transparent: false,
            opacity: 1.0
        });
        
        // Back face (card back) - solid red
        const backMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xcc0000,
            side: THREE.FrontSide,
            roughness: 0.5,
            metalness: 0.2,
            transparent: false,
            opacity: 1.0
        });
        
        // Side faces
        const sideMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xeeeeee,
            side: THREE.FrontSide
        });
        
        // Set materials: right, left, top, bottom, front, back
        materials.push(sideMaterial);
        materials.push(sideMaterial);
        materials.push(sideMaterial);
        materials.push(sideMaterial);
        materials.push(frontMaterial);
        materials.push(backMaterial);
        
        const cardMesh = new THREE.Mesh(cardGeometry, materials);
        
        // Create text for the card value
        const displayValue = this.rank + this.suit;
        const fontColor = (this.suit === '♥' || this.suit === '♦') ? '#ff0000' : '#000000';
        
        // Create a canvas for the card text
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 512;
        const context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        // Add text
        context.font = 'bold 80px Arial';
        context.fillStyle = fontColor;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(displayValue, canvas.width / 2, canvas.height / 2);
        
        // Draw smaller value at corners
        context.font = 'bold 40px Arial';
        context.fillText(displayValue, 40, 40);
        context.fillText(displayValue, canvas.width - 40, canvas.height - 40);
        
        // Create texture from canvas and apply to front face
        const cardTexture = new THREE.CanvasTexture(canvas);
        materials[4].map = cardTexture;
        
        // Create texture for back of card (card back pattern)
        const backCanvas = document.createElement('canvas');
        backCanvas.width = 256;
        backCanvas.height = 512;
        const backContext = backCanvas.getContext('2d');
        
        // Fill background with solid red
        backContext.fillStyle = '#cc0000';
        backContext.fillRect(0, 0, backCanvas.width, backCanvas.height);
        
        // Add border 
        backContext.fillStyle = '#880000';
        backContext.fillRect(20, 20, backCanvas.width - 40, backCanvas.height - 40);
        
        // Add design
        backContext.fillStyle = '#cc0000';
        backContext.font = 'bold 72px Arial';
        backContext.textAlign = 'center';
        backContext.textBaseline = 'middle';
        backContext.fillText('♠♣♥♦', backCanvas.width / 2, backCanvas.height / 2);
        
        // Create back texture and apply it
        const backTexture = new THREE.CanvasTexture(backCanvas);
        materials[5].map = backTexture;
        
        // Store the object3D reference
        this.object3D = cardMesh;
        
        // Set up userData to identify this as a card for scene management
        cardMesh.userData = {
            isCard: true,
            suit: this.suit,
            rank: this.rank
        };
        
        // Set initial rotation based on face up/down state
        if (!this.faceUp && cardMesh) {
            cardMesh.rotation.z = Math.PI;
            console.log(`Card ${this.rank}${this.suit} created face down`);
        }
        
        return this;
    }
    
    // Flip card face up or down
    flip() {
        // Toggle face up state
        this.faceUp = !this.faceUp;
        
        // In 3D mode, change the rotation
        if (!using2DFallback && this.object3D) {
            // For cards that are flat on the table, we rotate around Y axis
            this.object3D.rotation.y = this.faceUp ? 0 : Math.PI;
            console.log(`Card ${this.rank}${this.suit} flipped, faceUp: ${this.faceUp}, Y rotation: ${this.object3D.rotation.y}`);
        }
    }
}

// Create and return a new deck of 52 cards
function createDeck() {
    const suits = ['♠', '♥', '♦', '♣'];
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    let newDeck = [];
    
    for (let s of suits) {
        for (let r of ranks) {
            newDeck.push(new Card(s, r));
        }
    }
    return newDeck;
}

// Shuffle the deck using Fisher-Yates
function shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

// Setup a new hand
function setupGame() {
    // Clear the scene of cards
    clearCardsFromScene();
    
    // Reset game state
    deck = shuffleDeck(createDeck());
    playerHands = [[]];
    dealerHand = [];
    currentHandIndex = 0;
    bets = [currentBet];
    
    // Deal first cards (all face up)
    playerHands[0].push(drawCard());
    dealerHand.push(drawCard());
    playerHands[0].push(drawCard());
    
    // Deal dealer's second card face down
    const dealerSecondCard = drawCard();
    dealerSecondCard.faceUp = false;
    dealerHand.push(dealerSecondCard);
    
    console.log("Dealer's second card set face down:", dealerSecondCard.rank + dealerSecondCard.suit);
    
    // Position cards on table
    positionCards();
    
    // If in 3D mode, ensure the dealer's second card is visually face down
    if (!using2DFallback && dealerSecondCard.object3D) {
        // Use Y rotation for face down cards when they're flat on the table
        dealerSecondCard.object3D.rotation.y = Math.PI;
        console.log(`Applied Y rotation to dealer's second card: face down`);
    }
    
    // Force a redraw in 2D mode
    if (using2DFallback && ctx2D) {
        render2D();
    }
    
    gameState = 'playerTurn';
    message = "Your turn! Hit, stand, or use other options.";
    
    // Check for dealer blackjack first
    checkForDealerBlackjack();
    
    // Only check for player blackjack if dealer doesn't have blackjack
    if (gameState === 'playerTurn') {
        checkForPlayerBlackjack();
    }
    
    updateUI();
    setButtonStates();
}

// Draw a card from the deck and create its 3D model
function drawCard() {
    const card = deck.pop();
    
    // Only create 3D model and add to scene if not in 2D fallback mode
    if (!using2DFallback) {
        card.create3DModel();
        if (scene) {
            scene.add(card.object3D);
        }
    }
    
    return card;
}

// Position all cards on the table
function positionCards() {
    // Position dealer's cards
    dealerHand.forEach((card, index) => {
        if (card.object3D) {
            card.object3D.position.set(-2 + index * 1.2, 0, -2);
            
            // First reset all rotations
            card.object3D.rotation.set(0, 0, 0);
            
            // Then rotate cards to lay flat on the table (90 degrees around X axis)
            card.object3D.rotation.x = -Math.PI / 2;
            
            // Properly orient the card based on its face-up state
            if (!card.faceUp) {
                // Face down - show the back by rotating 180 degrees on Y axis
                // This works better when the card is already flat on the table
                card.object3D.rotation.y = Math.PI;
                console.log(`Dealer card ${index} set face down with Y rotation`);
            }
        }
    });
    
    // Position player's hands
    playerHands.forEach((hand, handIndex) => {
        const handOffsetX = handIndex * 4 - (playerHands.length - 1) * 2;
        
        hand.forEach((card, cardIndex) => {
            if (card.object3D) {
                card.object3D.position.set(handOffsetX + cardIndex * 1.2, 0, 2);
                
                // First reset all rotations
                card.object3D.rotation.set(0, 0, 0);
                
                // Rotate cards to lay flat on the table (90 degrees around X axis)
                card.object3D.rotation.x = -Math.PI / 2;
                
                // Player cards are always face up
            }
        });
    });
}

// Remove cards from the scene
function clearCardsFromScene() {
    // Remove player cards
    playerHands.forEach(hand => {
        hand.forEach(card => {
            if (card.object3D) {
                scene.remove(card.object3D);
            }
        });
    });
    
    // Remove dealer cards
    dealerHand.forEach(card => {
        if (card.object3D) {
            scene.remove(card.object3D);
        }
    });
}

// Calculate hand value with Ace adjustment
function getHandValue(hand) {
    let value = 0;
    let aces = 0;
    
    for (let card of hand) {
        value += card.getValue();
        if (card.rank === 'A') aces++;
    }
    
    // Adjust aces if needed to avoid busting
    while (value > 21 && aces > 0) {
        value -= 10;
        aces--;
    }
    
    return value;
}

// Check if hand can be split
function canSplit(hand) {
    return hand.length === 2 && 
           hand[0].rank === hand[1].rank && 
           playerHands.length < 4 && // Limit to 4 split hands
           money >= bets[currentHandIndex];
}

// Check if hand can be doubled down
function canDoubleDown(hand) {
    return hand.length === 2 && money >= bets[currentHandIndex];
}

// Check for dealer blackjack
function checkForDealerBlackjack() {
    const dealerUpCard = dealerHand[0];
    
    // Only check for dealer blackjack if the up card is 10, face, or Ace
    if (['10', 'J', 'Q', 'K', 'A'].includes(dealerUpCard.rank)) {
        // Need to peek at the hole card - don't show it to the player yet
        const dealerDownCard = dealerHand[1];
        const dealerHasBlackjack = 
            (dealerUpCard.getValue() + dealerDownCard.getValue() === 21);
            
        if (dealerHasBlackjack) {
            // Now reveal the dealer's face down card
            console.log(`Dealer has blackjack! Flipping face down card: ${dealerDownCard.rank}${dealerDownCard.suit}`);
            dealerDownCard.faceUp = true;
            
            // In 3D mode, update the card rotation directly
            if (!using2DFallback && dealerDownCard.object3D) {
                dealerDownCard.object3D.rotation.y = 0; // Show front
                console.log(`Set Y rotation to 0 for dealer's blackjack card`);
            } else {
                // In 2D mode
                dealerDownCard.flip();
            }
            
            // Check if player also has blackjack for a push
            const playerValue = getHandValue(playerHands[0]);
            const playerHasBlackjack = (playerValue === 21 && playerHands[0].length === 2);
            
            if (playerHasBlackjack) {
                message = "Both have blackjack – Push!";
                money += bets[0]; // Return bet
            } else {
                message = "Dealer has blackjack! You lose.";
                // Bet already deducted
            }
            
            gameState = 'gameOver';
            return true;
        }
    }
    
    return false;
}

// Check for player blackjack
function checkForPlayerBlackjack() {
    const playerValue = getHandValue(playerHands[0]);
    
    // Check for player blackjack
    if (playerValue === 21 && playerHands[0].length === 2) {
        // Show dealer's hole card
        console.log(`Player has blackjack! Revealing dealer's down card: ${dealerHand[1].rank}${dealerHand[1].suit}`);
        dealerHand[1].faceUp = true;
        
        // In 3D mode, update the card rotation directly
        if (!using2DFallback && dealerHand[1].object3D) {
            dealerHand[1].object3D.rotation.y = 0; // Show front
            console.log(`Set Y rotation to 0 for dealer's down card on player blackjack`);
        } else {
            // In 2D mode, flip the card
            dealerHand[1].flip();
        }
        
        message = "Blackjack! You win 3/2 payout!";
        money += Math.floor(bets[0] * 2.5); // Original bet + 3/2 winnings
        
        gameState = 'gameOver';
        return true;
    }
    
    return false;
}

// Player actions
function hit() {
    if (gameState !== 'playerTurn') return;
    
    const currentHand = playerHands[currentHandIndex];
    currentHand.push(drawCard());
    positionCards();
    
    // Force a redraw in 2D mode
    if (using2DFallback && ctx2D) {
        render2D();
    }
    
    const handValue = getHandValue(currentHand);
    
    if (handValue > 21) {
        message = `Hand ${currentHandIndex + 1} busts with ${handValue}!`;
        money -= bets[currentHandIndex];
        
        // Move to next hand or dealer's turn
        nextHand();
    }
    
    updateUI();
    setButtonStates();
}

function stand() {
    if (gameState !== 'playerTurn') return;
    
    nextHand();
    
    // Force a redraw in 2D mode
    if (using2DFallback && ctx2D) {
        render2D();
    }
    
    updateUI();
    setButtonStates();
}

function doubleDown() {
    if (gameState !== 'playerTurn' || !canDoubleDown(playerHands[currentHandIndex])) return;
    
    // Double the bet
    const additionalBet = bets[currentHandIndex];
    bets[currentHandIndex] *= 2;
    money -= additionalBet;
    
    // Draw one more card
    const currentHand = playerHands[currentHandIndex];
    currentHand.push(drawCard());
    positionCards();
    
    // Force a redraw in 2D mode
    if (using2DFallback && ctx2D) {
        render2D();
    }
    
    const handValue = getHandValue(currentHand);
    
    if (handValue > 21) {
        message = `Hand ${currentHandIndex + 1} busts with ${handValue}!`;
    }
    
    // Move to next hand regardless of outcome
    nextHand();
    updateUI();
    setButtonStates();
}

function split() {
    if (gameState !== 'playerTurn' || !canSplit(playerHands[currentHandIndex])) return;
    
    const currentHand = playerHands[currentHandIndex];
    
    // Create a new hand with the second card
    const newHand = [currentHand.pop()];
    playerHands.splice(currentHandIndex + 1, 0, newHand);
    
    // Add a new bet for the second hand
    bets.splice(currentHandIndex + 1, 0, bets[currentHandIndex]);
    money -= bets[currentHandIndex + 1];
    
    // Deal a new card to each hand
    currentHand.push(drawCard());
    newHand.push(drawCard());
    
    // Reposition cards
    positionCards();
    
    // Force a redraw in 2D mode
    if (using2DFallback && ctx2D) {
        render2D();
    }
    
    // Check for aces (in some casinos, split aces only get one card each)
    if (currentHand[0].rank === 'A') {
        // Restrict to one card per hand and move to dealer turn
        // Or allow normal play as per casino rules
    }
    
    // Check if current hand is blackjack after split
    checkBlackjackAfterSplit();
    
    updateUI();
    setButtonStates();
}

// Check for blackjack after splitting
function checkBlackjackAfterSplit() {
    const currentHand = playerHands[currentHandIndex];
    if (getHandValue(currentHand) === 21) {
        // In some casinos, blackjack after split is just 21, not a true blackjack
        // Rules vary on payout
        nextHand();
    }
}

// Move to the next hand or dealer's turn
function nextHand() {
    currentHandIndex++;
    
    // If there are more hands to play
    if (currentHandIndex < playerHands.length) {
        message = `Playing hand ${currentHandIndex + 1}`;
        
        // Force a redraw in 2D mode
        if (using2DFallback && ctx2D) {
            render2D();
        }
    } else {
        // All hands played, move to dealer's turn
        dealerTurn();
    }
}

// Dealer's turn
function dealerTurn() {
    gameState = 'dealerTurn';
    message = "Dealer's turn";
    
    // Flip dealer's hidden card
    if (!dealerHand[1].faceUp) {
        console.log(`FLIPPING: Dealer's face down card: ${dealerHand[1].rank}${dealerHand[1].suit}`);
        
        // First set the faceUp property to true
        dealerHand[1].faceUp = true;
        
        // Check if in 3D mode
        if (!using2DFallback && dealerHand[1].object3D) {
            console.log(`3D card found, current rotation Y: ${dealerHand[1].object3D.rotation.y}`);
            
            // Directly set rotation to show front (0 rotation on Y axis when cards are flat)
            dealerHand[1].object3D.rotation.y = 0;
            console.log(`Set Y rotation to 0 for face up`);
        } else {
            // In 2D mode, just flip the card using the flip method
            dealerHand[1].flip();
            console.log(`Used flip() method in 2D mode`);
        }
        
        console.log(`Dealer's second card now face up: ${dealerHand[1].faceUp}`);
    }
    
    // Force a redraw in 2D mode
    if (using2DFallback && ctx2D) {
        render2D();
    } else {
        // Force rendering in 3D
        positionCards();
    }
    
    // Dealer draws until they have at least 17
    const dealerPlay = () => {
        const dealerValue = getHandValue(dealerHand);
        console.log(`Dealer's current hand value: ${dealerValue}`);
        
        if (dealerValue < 17) {
            // Draw a card and continue
            const newCard = drawCard();
            console.log(`Dealer draws: ${newCard.rank}${newCard.suit}`);
            dealerHand.push(newCard);
            positionCards();
            
            // Force a redraw in 2D mode
            if (using2DFallback && ctx2D) {
                render2D();
            }
            
            // Use setTimeout to animate dealer drawing cards
            setTimeout(dealerPlay, 1000);
        } else {
            // Dealer stands, resolve game
            console.log(`Dealer stands with ${dealerValue}`);
            resolveGame();
        }
    };
    
    // Start dealer play with a slight delay
    setTimeout(dealerPlay, 1000);
    
    updateUI();
    setButtonStates();
}

// Resolve the game and determine winners
function resolveGame() {
    const dealerValue = getHandValue(dealerHand);
    let resultsMessage = "";
    
    // Check each player hand against dealer
    playerHands.forEach((hand, index) => {
        const handValue = getHandValue(hand);
        
        // Skip busted hands (already deducted during play)
        if (handValue > 21) {
            resultsMessage += `Hand ${index + 1}: Bust. `;
            return;
        }
        
        // Dealer busts, all remaining player hands win
        if (dealerValue > 21) {
            resultsMessage += `Hand ${index + 1} wins (dealer busts). `;
            money += bets[index] * 2; // Win bet (return original bet + profit)
        } 
        // Push (tie)
        else if (dealerValue === handValue) {
            resultsMessage += `Hand ${index + 1}: Push. `;
            money += bets[index]; // Return bet
        } 
        // Player wins
        else if (handValue > dealerValue) {
            resultsMessage += `Hand ${index + 1} wins. `;
            money += bets[index] * 2; // Win bet (return original bet + profit)
        } 
        // Dealer wins
        else {
            resultsMessage += `Hand ${index + 1} loses. `;
            // Bet already deducted
        }
    });
    
    message = resultsMessage;
    gameState = 'gameOver';
    
    // Force a redraw in 2D mode
    if (using2DFallback && ctx2D) {
        render2D();
    }
    
    updateUI();
    setButtonStates();
}

// Start a new game
function newGame() {
    console.log('New game button clicked');
    
    // Check if player has money to bet
    if (money < currentBet) {
        message = "Not enough money to play!";
        updateUI();
        return;
    }
    
    // Deduct initial bet
    money -= currentBet;
    
    // Clear any error messages
    if (debugElement) {
        debugElement.textContent = using2DFallback ? 
            'WebGL not supported. Using 2D canvas fallback.' : 
            'Game running in 3D mode.';
    }
    
    gameState = 'playerTurn';
    setupGame();
    
    // Force a redraw in 2D mode
    if (using2DFallback && ctx2D) {
        render2D();
    }
    
    console.log('New game started');
}

// Update the UI elements
function updateUI() {
    if (moneyDisplay) moneyDisplay.textContent = `Money: $${money}`;
    if (betDisplay) betDisplay.textContent = `Current Bet: $${currentBet}`;
    if (betAmountDisplay) betAmountDisplay.textContent = currentBet;
    if (messageArea) messageArea.textContent = message;
}

// Enable/disable buttons based on game state
function setButtonStates() {
    // Guard against null elements
    if (!hitButton || !standButton || !doubleButton || !splitButton || 
        !newGameButton || !decreaseBetButton || !increaseBetButton) {
        console.error('Some button elements are missing');
        return;
    }

    const currentHand = playerHands[currentHandIndex] || [];
    
    switch (gameState) {
        case 'betting':
            hitButton.disabled = true;
            standButton.disabled = true;
            doubleButton.disabled = true;
            splitButton.disabled = true;
            newGameButton.disabled = false;
            decreaseBetButton.disabled = false;
            increaseBetButton.disabled = money < currentBet + 10;
            break;
            
        case 'playerTurn':
            const canDouble = canDoubleDown(currentHand);
            const canSplitPair = canSplit(currentHand);
            
            hitButton.disabled = false;
            standButton.disabled = false;
            doubleButton.disabled = !canDouble;
            splitButton.disabled = !canSplitPair;
            newGameButton.disabled = true;
            decreaseBetButton.disabled = true;
            increaseBetButton.disabled = true;
            break;
            
        case 'dealerTurn':
            hitButton.disabled = true;
            standButton.disabled = true;
            doubleButton.disabled = true;
            splitButton.disabled = true;
            newGameButton.disabled = true;
            decreaseBetButton.disabled = true;
            increaseBetButton.disabled = true;
            break;
            
        case 'gameOver':
            hitButton.disabled = true;
            standButton.disabled = true;
            doubleButton.disabled = true;
            splitButton.disabled = true;
            newGameButton.disabled = false;
            decreaseBetButton.disabled = false;
            increaseBetButton.disabled = money < currentBet + 10;
            break;
    }
}

// Betting functions
function decreaseBet() {
    if (currentBet >= 20) {
        currentBet -= 10;
        updateUI();
    }
}

function increaseBet() {
    if (money >= currentBet + 10) {
        currentBet += 10;
        updateUI();
    }
}

// Toggle strategy card visibility
function toggleStrategyCard() {
    console.log('Toggle strategy card clicked');
    if (strategyCard) {
        if (strategyCard.style.display === 'none' || strategyCard.style.display === '') {
            console.log('Showing strategy card');
            strategyCard.style.display = 'block';
            strategyToggle.textContent = 'Hide Strategy';
        } else {
            console.log('Hiding strategy card');
            strategyCard.style.display = 'none';
            strategyToggle.textContent = 'Show Strategy';
        }
    } else {
        console.error('Strategy card element not found');
    }
}

// Set the initial game state
gameState = 'betting';
updateUI();
setButtonStates();
