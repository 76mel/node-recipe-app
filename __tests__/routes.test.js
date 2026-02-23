const request = require('supertest');
const express = require('express');
const routes = require('../src/routes');
const { initializeTestDb } = require('./test-database');

// Mock the database module to use test database
jest.mock('../src/database', () => ({
  getDbConnection: () => require('./test-database').getTestDbConnection()
}));

// Simple app setup for testing
function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  
  // Simple mock for res.render
  app.use((req, res, next) => {
    res.render = (view, locals) => res.json({ view, locals });
    next();
  });
  
  app.use('/', routes);
  return app;
}

describe('Routes', () => {
  let app;
  let db;

  beforeEach(async () => {
    app = createTestApp();
    db = await initializeTestDb();
  });

  afterEach(async () => {
    if (db) {
      await db.close();
    }
  });

  test('GET / should return 200', async () => {
    const response = await request(app).get('/');
    expect(response.status).toBe(200);
    expect(response.body.view).toBe('home');
  });

  test('POST /recipes should create a new recipe', async () => {
    const newRecipe = {
      title: 'New Test Recipe',
      ingredients: 'New test ingredients',
      method: 'New test method'
    };

    const response = await request(app)
      .post('/recipes')
      .send(newRecipe);

    expect(response.status).toBe(302); // Redirect status
    expect(response.headers.location).toBe('/recipes');

    // Verify recipe was created
    const recipe = await db.get('SELECT * FROM recipes WHERE title = ?', [newRecipe.title]);
    expect(recipe).toBeDefined();
    expect(recipe.title).toBe(newRecipe.title);
  });

  test('POST /recipes should return 400 if title is empty', async () => {
    const invalidRecipe = {
      title: '',
      ingredients: 'Test ingredients',
      method: 'Test method'
    };

    const response = await request(app)
      .post('/recipes')
      .send(invalidRecipe);

    expect(response.status).toBe(400);
    expect(response.text).toContain('Recipe title is required');
  });

  test('POST /recipes should return 400 if title is only whitespace', async () => {
    const invalidRecipe = {
      title: '   ',
      ingredients: 'Test ingredients',
      method: 'Test method'
    };

    const response = await request(app)
      .post('/recipes')
      .send(invalidRecipe);

    expect(response.status).toBe(400);
    expect(response.text).toContain('Recipe title is required');
  });

  test('POST /recipes should return 400 if title is missing', async () => {
    const invalidRecipe = {
      ingredients: 'Test ingredients',
      method: 'Test method'
    };

    const response = await request(app)
      .post('/recipes')
      .send(invalidRecipe);

    expect(response.status).toBe(400);
    expect(response.text).toContain('Recipe title is required');
  });

  test('DELETE /recipes/:id should delete a recipe', async () => {
    // First create a recipe to delete
    const newRecipe = {
      title: 'Recipe to Delete',
      ingredients: 'Test ingredients',
      method: 'Test method'
    };

    await request(app)
      .post('/recipes')
      .send(newRecipe);

    // Get the created recipe
    const recipe = await db.get('SELECT * FROM recipes WHERE title = ?', [newRecipe.title]);
    expect(recipe).toBeDefined();

    // Delete the recipe
    const deleteResponse = await request(app)
      .delete(`/recipes/${recipe.id}`);

    expect(deleteResponse.status).toBe(302); // Redirect status
    expect(deleteResponse.headers.location).toBe('/recipes');

    // Verify recipe was deleted
    const deletedRecipe = await db.get('SELECT * FROM recipes WHERE id = ?', [recipe.id]);
    expect(deletedRecipe).toBeUndefined();
  });

  test('GET /recipes/:id should return 404 view for deleted recipe', async () => {
    // First create a recipe to delete
    const newRecipe = {
      title: 'Recipe to Delete for 404 Test',
      ingredients: 'Test ingredients',
      method: 'Test method'
    };

    await request(app)
      .post('/recipes')
      .send(newRecipe);

    // Get the created recipe
    const recipe = await db.get('SELECT * FROM recipes WHERE title = ?', [newRecipe.title]);
    expect(recipe).toBeDefined();

    // Delete the recipe
    await request(app)
      .delete(`/recipes/${recipe.id}`);

    // Try to get the deleted recipe - it should show the "not found" view
    const getResponse = await request(app)
      .get(`/recipes/${recipe.id}`);

    expect(getResponse.status).toBe(200);
    expect(getResponse.body.locals.recipe).toBeUndefined();
  });
});