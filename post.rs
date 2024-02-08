#[macro_use] extern crate rocket;

#[cfg(test)] mod tests;

use rocket::{State, Shutdown};
use rocket::fs::{relative, FileServer};
use rocket::form::Form;
use rocket::response::stream::{EventStream, Event};
use rocket::serde::{Serialize, Deserialize};
use rocket::tokio::sync::broadcast::{channel, Sender, error::RecvError};
use rocket::tokio::select;
use std::fs::OpenOptions;
use std::io::Write;
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
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .open("messages.json")
        .unwrap();
    let mut messages: Vec<Message> = match serde_json::from_reader(&file) {
        Ok(data) => data,
        Err(_) => Vec::new(),
    };

    //let cloned = message.clone();
    // Append the new message to the array
    messages.push(message.clone());

    // Write the updated array back to the file
    file.set_len(0).unwrap(); 
    serde_json::to_writer_pretty(&file, &messages).unwrap();

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
