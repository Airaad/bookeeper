CREATE TABLE books(
	id SERIAL PRIMARY KEY,
	title VARCHAR(50),
	author VARCHAR(50),
	isbn BIGINT
);

CREATE TABLE users(
	id SERIAL PRIMARY KEY,
	first_name VARCHAR(50),
	user_name VARCHAR(100),
	password VARCHAR(100)
);

CREATE TABLE notes(
	id SERIAL PRIMARY KEY,
	body TEXT,
	rating INTEGER,
	book_id INTEGER REFERENCES books(id),
	user_id INTEGER REFERENCES users(id)
);