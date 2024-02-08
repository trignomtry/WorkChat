#[macro_use] extern crate rocket;

#[cfg(test)] mod tests;

use rocket::{State, Shutdown};
use rocket::fs::{relative, FileServer};
use rocket::form::Form;
use rocket::response::stream::{EventStream, Event};
use rocket::serde::{Serialize, Deserialize};
use rocket::tokio::sync::broadcast::{channel, Sender, error::RecvError};
use rocket::tokio::select;
use std::fs::{OpenOptions, File};
use std::io::{BufReader, BufWriter};
use std::path::Path;
use serde_json;

#[derive(Debug, Clone, FromForm, Serialize, Deserialize)]
#[cfg_attr(test, derive(PartialEq, UriDisplayQuery))]
#[serde(crate = "rocket::serde")]
struct Message {
    #[field(validate = len(..30))]
    pub room: String,
    #[field(validate = len(..20))]
    pub username: String,
    pub message: String,
}

/// Read messages from JSON file
fn read_messages_from_file<P: AsRef<Path>>(path: P) -> Vec<Message> {
    if let Ok(file) = File::open(path) {
        let reader = BufReader::new(file);
        if let Ok(messages) = serde_json::from_reader(reader) {
            return messages;
        }
    }
    Vec::new()
}

/// Write messages to JSON file
fn write_messages_to_file<P: AsRef<Path>>(path: P, messages: &[Message]) -> std::io::Result<()> {
    let file = OpenOptions::new()
        .write(true)
        .truncate(true)
        .create(true)
        .open(path)?;
    let writer = BufWriter::new(file);
    serde_json::to_writer_pretty(writer, messages)?;
    Ok(())
}

/// Returns an infinite stream of server-sent events. Each event is a message
/// pulled from a broadcast queue sent by the `post` handler.
#[get("/events")]
async fn events(queue: &State<Sender<Message>>, mut end: Shutdown) -> EventStream![] {
    let mut rx = queue.subscribe();
    EventStream! {
        loop {
            let msg = select! {
                msg = rx.recv() => match msg {
                    Ok(msg) => msg,
                    Err(RecvError::Closed) => break,
                    Err(RecvError::Lagged(_)) => continue,
                },
                _ = &mut end => break,
            };

            yield Event::json(&msg);
        }
    }
}

/// Receive a message from a form submission and broadcast it to any receivers.
#[post("/message", data = "<form>")]
fn post(form: Form<Message>, queue: &State<Sender<Message>>) {
    let message = form.into_inner();

    // Read existing messages (if any) from the file
    let messages = read_messages_from_file("static/messages.json");

    // Append the new message to the array
    let mut updated_messages = messages.clone();
    updated_messages.push(message.clone());

    // Write the updated array back to the file
    if let Err(e) = write_messages_to_file("static/messages.json", &updated_messages) {
        eprintln!("Error writing messages to file: {}", e);
    }

    // Broadcast the message to subscribers (using a reference to avoid moving)
    let _res = queue.send(message); // Use a reference here
}

#[launch]
fn rocket() -> _ {
    rocket::build()
        .manage(channel::<Message>(1024).0)
        .mount("/", routes![post, events])
        .mount("/", FileServer::from(relative!("static")))
}
