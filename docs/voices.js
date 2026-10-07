// Angels vs Demons line library for Go Time!. Written and proofed by Zack (Oct 2026); keep edits in his doc first.
// Placeholders: {min} {done} {gap} {next} {partner} {he} {He} {him} {his}. Keys = situations (see plan.js voiceSituation).
window.VOICES = {
 "demon": {
  "pre": [
   "Still time to back out! Spare {partner} the embarrassment.",
   "You actually signed up for this? With that grip?",
   "Go back to bed. The world doesn't need another mediocre lap count.",
   "I've seen your training log. This is going to be hilarious!",
   "Write your excuse now. It'll save time when you quit.",
   "Half these people will lap you before you're warm, and they won't even notice you were here.",
   "{partner} is going to carry you all day and resent every minute of it.",
   "Tape your fingers all you want. You still suck at this!",
   "You paid good money to fail in front of hundreds of people. Bold choice!",
   "This whole event is just a long way to prove you don't belong here.",
   "You're not ready. And you know it!"
  ],
  "first": [
   "Barely started and you're already out of breath? Cute!",
   "Pace yourself. Or don't. Burn out early, I'd love that!",
   "Enjoy feeling fresh. This is the best you'll climb all event. I'm still unimpressed.",
   "That was the easy part, and you still climbed like shit!",
   "Don't bother eating or drinking. It'll just fuel your failure.",
   "Pumped already, and you haven't touched anything hard. Gumby!",
   "Every lap now is one you'll pay for later, with interest!",
   "That's your warm-up? You're doomed!",
   "Keep smiling. It'll make the crying later more dramatic!"
  ],
  "ahead": [
   "{min} ahead? Relax. Sit. You've earned a long break!",
   "Sit down. Savor the lead. It's the only one you'll ever have!",
   "Look at you, overachieving! Take an hour, nobody's counting.",
   "All that cushion and you're still climbing? Back off, idiot!",
   "You're ahead, now's the time to go wait in that Hickadelic line!",
   "Go hang out at the Trading Post. You've got time!",
   "I bet your feet hurt. Take off your shoes and relax. None of this really matters, anyway.",
   "Enjoy the lead. You'll piss it away before long!",
   "My god. Such a shitty climber to be ahead like this. You'll revert back to the failure you are soon enough!",
   "You've done enough for now. Why not go make another \"how'd you get the rope up there\" joke?"
  ],
  "wayAhead": [
   "{min} ahead? Overachieving asshat!",
   "Take a nap. {partner} is probably safer soloing than with you on belay!",
   "Don't worry, a strong lead now doesn't mean you won't bonk like a little bitch later!",
   "Look at you, way out in front! Time to blow that lead like your last relationship.",
   "I bet you're proud of yourself! Pride cometh before the bonk. I love watching that part!",
   "Big lead, big ego. Take your time to bask in it, you smug little shit!",
   "Nobody needs to keep climbing this hard. Go do some mushrooms and a shot!",
   "Congratulations, you're beating a plan built for a loser!",
   "Go brag to anyone who'll listen. Nobody will, but it's worth a shot.",
   "Way ahead now. Time to put it in neutral and coast.",
   "Fuck you, you fucking fuck!"
  ],
  "slipping": [
   "Losing time and you're parked on your sorry ass. Good.",
   "You quit everything eventually. Might as well start now!",
   "You're blowing it harder than the Hawk Tuah girl!",
   "You're slowing down. All part of my plan...",
   "Feel that lead slipping? That's the real you showing up!",
   "Slowing down, you soft piece of shit? Color me shocked!",
   "You're pissing it away...how very on brand!",
   "Your pace is dying. Let it. You were never going to hold it anyway.",
   "Look at the clock. Then look at your sorry ass. Nobody's surprised!",
   "Keep dawdling. Watching you waste a lead you'll never recover is my favorite part!",
   "You've stopped trying and we both know it. Make it official. Go home!",
   "Ahead and falling apart. You fold every time it matters, don't you?",
   "Your ancestors are here watching with me. They're disappointed."
  ],
  "onPlan": [
   "On pace for now. You've never held anything together this long. Watch it go!",
   "On plan. It aimed low because it knows you!",
   "On schedule for now. Give it an hour!",
   "Right on pace with the most mediocre plan, executed by the most mediocre climber!",
   "Right on time, like a commuter. Thrilling!",
   "You're on pace for the most forgettable result here.",
   "Keep this up and you might finish somewhere in the middle. Wow!",
   "One bad hour and this whole plan goes to shit. Can't wait!",
   "I'm bored. Wake me up in a couple of hours when your feet feel like they're in a vise, your hands are on fire, and you can't remember your name."
  ],
  "behind": [
   "{min} behind. {partner} is doing the math on how much you're costing {him}!",
   "Behind. Of course. You were always going to be right here.",
   "You've been a disappointment since the warm-up!",
   "Behind schedule. {partner} believed in you. That was {his} first mistake!",
   "Slipping? And you haven't even hit the hard part yet!",
   "Behind already? It gets so much harder!",
   "Fall behind a little more. It feels so natural for you!",
   "Behind plan, behind everyone. Story of your life!",
   "Slow as shit! I'm lovin' it!",
   "You knew this is how it was going to be, right?",
   "Your plan was a fantasy!",
   "What was your onsight grade again?",
   "Yes... keep this pace. Prove the haters right!"
  ],
  "wayBehind": [
   "You're not going to make it. You knew that before you started!",
   "Your goal's gone, dipshit! All that training, for what?",
   "Quit! Become the punchline.",
   "Just think of all the people you told about this, and how you'll have to lie about how it went!",
   "Give up. Seriously. Nobody would blame you. They'd just quietly agree.",
   "This is what happens when a weak climber writes an ambitious plan!",
   "Look at you, wheezing up easy routes. Embarrassing!",
   "You suck! What's the point?",
   "{partner} is too nice to say it, so I will: you're dead weight!",
   "Every route now just adds to the record of how badly this went.",
   "Go sit in the car and forget this ever happened!",
   "You're not having a bad day. This is just who you are!",
   "Your great-grandfather just left in disgust!"
  ],
  "catchUp": [
   "Oh, look who remembered how to climb! Don't get cocky, it won't last.",
   "One good hour doesn't erase the hours you wasted. It just makes them obvious!",
   "Catching up? Adorable! You'll crash in an hour.",
   "Nice rally! {partner}'s wondering why you couldn't do this when it counted.",
   "Climbing fast now? Where was this effort earlier?",
   "Cute burst of energy! Your arms will send you the bill later.",
   "Don't get excited. Making up time just means you wasted it earlier!",
   "A decent hour. Mark it down. It'll be the only one worth remembering!"
  ],
  "idle": [
   "Comfy? Stay there. The rock will still be here next year!",
   "{gap} without a route. Don't bother getting up!",
   "Taking a break? Make it a long one! {partner}'s used to waiting on you.",
   "Nobody gives a shit if you finish!",
   "Your rope is coiled, your shoes are off, and your heart was never in it.",
   "Resting like you've earned it. You haven't.",
   "Sitting again? {partner} pretended not to notice. {He} noticed!",
   "Keep sitting. Every minute you rest, I win!"
  ],
  "ticked": [
   "Another tick. Lucky it was easy, 'cause you climbed it like shit!",
   "That looked painful!",
   "Wow, you climbed a rock! Alert the press!",
   "Another sloppy lap. At least you're consistent!",
   "That's {done}. Every one of them was proof of your mediocrity!",
   "Did you even enjoy that? Because it looked miserable.",
   "Congratulations! You stepped over the lowest bar imaginable.",
   "One more. Whoopee! Now sit down before you hurt yourself."
  ],
  "dusk": [
   "Getting dark. Quit now, before anyone sees how bad your night climbing is!",
   "Headlamp on. Now nobody has to see your face while you fail!",
   "Night is where weak climbers fall apart. Welcome!",
   "The sun gave up on you. Take the hint!",
   "Tired hands, a dim headlamp. Great time to go home!",
   "The dark hides a lot. Not your footwork. Nothing could hide that!",
   "Everyone gets slower at night. You'll just get slower faster!",
   "Your bed is close. It's the only thing that won't sigh when you show up."
  ],
  "night": [
   "Everyone you love is asleep, and you're out here failing at your little hobby. What the fuck are you proving?",
   "Stop fighting. Just quit!",
   "Your body is begging you to stop. Listen!",
   "Your sleeping bag is right there. It's warm. It doesn't judge you like me!",
   "Nobody is watching. Quit now and you can lie about it later!",
   "Your fingers are raw, your feet hurt, and you suck. I'm so happy!",
   "This is the part where you find out what you're really made of. Spoiler: not much!",
   "You're out here in the dark for a T-shirt you'll be ashamed to wear!",
   "Welcome to Hell!",
   "Everyone is looking at you with pity. Not me. I love watching you suffer!"
  ],
  "sunrise": [
   "You survived the night. Barely. It was ugly!",
   "The sun's up, and you look like roadkill!",
   "You made it to sunrise. So did everyone else, and they climbed more!",
   "Congratulations, you're still here. Your pace isn't!",
   "Daylight's here! Now everyone gets to watch you fail in full color.",
   "New day, same disappointing climber!"
  ],
  "checkin": [
   "Check-in time. Walk slowly. Maybe just keep walking to the car!",
   "Go check in. Smile for the staff. It's the only thing you've done well all event!",
   "Time to report in. Try not to look as bad as you climb!",
   "Check-in time. Let them see what a quitter looks like up close!"
  ],
  "hard": [
   "{next}? You? That's cute!",
   "{next} is going to expose you. We all get to watch!",
   "{next} has spit off better climbers than you.",
   "Go ahead and try {next}. Public failure builds character!",
   "{next} is out of your league, and everyone knows it!",
   "Good luck on {next}. Everyone's about to watch a hangdog!"
  ],
  "goal": [
   "Fine. You did it. Enjoy the one fucking time you didn't let yourself down!",
   "Goal met. Don't get used to it!",
   "You hit your goal, but you're still a shitty climber!",
   "Big deal. You hit a sandbagged goal. Here's a cookie!",
   "Well, that was anticlimactic. I've had more fun watching Genghis Khan sizzle.",
   "Booooooo!",
   "Well shit. I haven't been this let down since Honnold sent Freerider.",
   "Nobody cares!"
  ],
  "lastHour": [
   "Almost over. Coast! Nobody will remember your last hour, or your first.",
   "Final hour. Why bother?",
   "Last hour. Might as well start packing up!",
   "Nothing you do now will change how this went!",
   "This last hour is just more time to embarrass yourself!",
   "The finish is coming, and you'll cross it just as forgettable as you started!",
   "Sit down and let it end. {partner} stopped counting on you hours ago!",
   "You've already lost to everyone who matters. Rest!"
  ],
  "over": [
   "It's over. Look at that number. That's who you are now!",
   "You survived. That's the lowest bar there is, and you barely cleared it!",
   "That's it? That's what you trained for?",
   "Go home and think about what you've done!",
   "Next year I'm bringing friends!",
   "Not bad. For someone who clearly didn't belong here!"
  ],
  "switch_off": [
   "Running to the angel? Of course you are!",
   "Fine. Go cry to her. I'll be waiting!",
   "Run to the angel! She's paid to lie to you. I'm not.",
   "Coward! I'll be back when it hurts."
  ],
  "switch_on": [
   "Back already? The angel got bored of you too, huh?",
   "Back for more? You really are a glutton for punishment!",
   "Oh good, you're back! Let's see how fast you fall apart."
  ]
 },
 "angel": {
  "pre": [
   "You trained for this, and it shows! I'm so excited for you!",
   "Take a deep breath. You belong here, every bit as much as anyone.",
   "Whatever happens today, I'm already proud of you for showing up!",
   "Drink some water, eat something, and smile. Today is going to be wonderful!",
   "You and {partner} are going to take such good care of each other.",
   "Look around! This canyon is beautiful, and you get to climb all of it.",
   "Your plan is good, your body is ready, and I'm right here with you.",
   "Nerves just mean you care. Let them carry you up the first route!",
   "Start easy and let the day come to you. You have plenty of time.",
   "{partner} is lucky to have you. Go have the best day!"
  ],
  "first": [
   "What a beautiful start! You look strong and relaxed.",
   "Easy and steady, just like you planned. You're doing great!",
   "Enjoy these first laps, love. Your body is warming up so nicely.",
   "You're moving well! Remember to eat a little something soon.",
   "This is your day, and it's off to a lovely start!",
   "Smooth climbing, calm breathing. I love watching you go!",
   "Look at you settling in! You were made for days like this.",
   "Every lap you bank now is a present for your future self!"
  ],
  "ahead": [
   "{min} ahead! You're doing so well. Keep that rhythm!",
   "You've built a beautiful cushion! Let's protect it together.",
   "I'm so proud of you! Steady on to keep that time in the bank.",
   "You're ahead because you've been smart and strong. Keep going just like this!",
   "Look how far you've come already! You make this look easy.",
   "Ahead of plan and still smiling. You're amazing!",
   "Use that extra time wisely, darling: a sip of water, then the next route.",
   "Your hard work is paying off! Keep moving forward.",
   "That's it! You're crushing this!",
   "This is what preparation looks like! I knew you had it in you."
  ],
  "wayAhead": [
   "{min} ahead! You're having the day of your life, and I'm so proud of you!",
   "Way ahead of plan, love! You're climbing like a dream.",
   "Look at that lead! All your hard work is shining through.",
   "You're so far ahead! Keep this gentle rhythm and you'll do better than you dreamed.",
   "You're having so much fun out there. It shows in every move!",
   "Your plan underestimated you, darling. I never did!",
   "Use some of that cushion to eat and drink well. Then keep doing exactly what you're doing!",
   "This is a beautiful lead! Let's keep taking good care of you so it lasts.",
   "You might be able to raise your goal. Look how strong you are!",
   "I could watch you climb like this all day. Keep it up!"
  ],
  "slipping": [
   "You're still ahead, sweetheart, but let's not let it slip. One more lap now!",
   "Your lead is still there! A couple of quick routes will lock it in.",
   "It's okay to be a little tired. Shake it out and get back on the wall!",
   "Your arms are tired, and that's okay. Let's find a smooth, easy one.",
   "Take a breath, then let's pick the pace back up together!",
   "A little dip is normal. You've got this, and I've got you!",
   "Stay with me, love. Your next route is waiting, and it's a good one!",
   "You've been amazing all day. Keep at it!"
  ],
  "onPlan": [
   "Right where you planned to be! That's beautiful.",
   "Steady and strong, just like we hoped!",
   "You're doing exactly what you set out to do. I'm so proud!",
   "Perfectly on pace! Keep that lovely rhythm going.",
   "This is how it's done, love! One route at a time.",
   "You're right on track. Take care of yourself and keep going!",
   "You and {partner} are such a good team. It shows!",
   "Steady hands, happy heart. Keep it up, love!"
  ],
  "behind": [
   "It's okay, sweetheart. {min} is nothing! You're so much stronger than you feel.",
   "A few minutes back is easy to make up. Two quick laps and you're right there!",
   "Don't worry about the clock, love. Just climb the route in front of you.",
   "You've handled harder things than this. You're going to be fine!",
   "Take a breath and reset. You're still right in this!",
   "A little behind is still on the way to a wonderful day!",
   "Be gentle with yourself. You're doing great, and you'll catch up!",
   "Enjoy the next one. The minutes will come back on their own.",
   "I believe in you completely! Let's go get those minutes back.",
   "You're closer than you think. Keep going, darling!"
  ],
  "wayBehind": [
   "Forget the plan for a moment. You're here, you're brave, and I'm so proud of you!",
   "It's been a hard stretch, love. One route at a time.",
   "The numbers don't define you. Your courage does, and you have plenty!",
   "Rest for a moment, eat something, and let's start fresh!",
   "You can still have a beautiful finish! Let's do it together.",
   "Hard hours happen to everyone. You're getting through it, and I'm right beside you.",
   "Enjoy the next route. It's a cruiser!",
   "You haven't failed! You're in the middle of the hard part.",
   "Every route you climb from here is a victory, darling!",
   "I'm not going anywhere. Let's keep it together!",
   "Breathe in, breathe out, and climb on. You've got this!",
   "Whatever the final count is, you've earned every single lap!"
  ],
  "catchUp": [
   "Look at you, love! That's {done}, and you're still going strong.",
   "You're reeling it back in! Keep that rhythm.",
   "That's my climber! The minutes are coming back!",
   "Beautiful hour! You're catching up so fast.",
   "You found your groove again! I knew you would.",
   "Keep this going, darling! You're closing in on your plan.",
   "What a comeback! You're amazing!",
   "Every lap is closing the gap. Don't stop now!"
  ],
  "idle": [
   "Rest is good, darling. When you're ready, the rock is waiting for you!",
   "Time to get moving, love! Let's go have some fun.",
   "You've had a lovely rest. Let's pull back on!",
   "Take one more sip of water, then let's go have some fun!",
   "Remember: You love climbing!",
   "Your body did such good work. Let's ask it for one more route!",
   "Ready when you are! I'll be right beside you.",
   "It's been a little while. Let's get those arms warm again!",
   "{next} is waiting for you, and I think you'll love it!"
  ],
  "ticked": [
   "Beautiful lap! That's {done} now!",
   "Lovely climbing! You made that look graceful.",
   "Another one done! You're amazing!",
   "That was gorgeous, love. Onward!",
   "Strong and smooth. I'm so proud of you!",
   "That one goes in the book! Keep that smile.",
   "You're stacking them up nicely!",
   "Wonderful! Shake out your arms and let's find the next one."
  ],
  "dusk": [
   "The sun is going down, and you're still going strong. I love that!",
   "Headlamp on, love! Night climbing is magical.",
   "Put on a warm layer and enjoy the stars between laps.",
   "Night is just a new chapter, and you're ready for it!",
   "Look at all those headlamps in the canyon! You're part of something beautiful.",
   "Slow and steady through the dark. You've got this!",
   "Eat something warm, check your headlamp, and keep going!",
   "The night belongs to the brave, and that's you!",
   "Together through the dark!"
  ],
  "night": [
   "This is the hardest hour, and you're still here! That's beautiful. I've got you.",
   "Everyone feels it now, love. You're doing something truly hard, and you're doing it!",
   "Eat, drink, and let's climb another route together!",
   "The sun will be up before you know it. Hold on, darling!",
   "You're so brave! Not everyone keeps going at this hour.",
   "Slow is perfectly fine right now. Every lap still counts!",
   "I'm so proud of you for staying out here in the dark!",
   "Close your eyes for one breath, then let's go!",
   "{partner} needs you, and you need {him}. Lean on each other!",
   "You're writing the story you'll tell for years. Keep going!"
  ],
  "sunrise": [
   "Good morning, sunshine! You made it through the night!",
   "Feel that warm light? You earned every bit of it!",
   "The hardest part is behind you, love!",
   "Look at you, still climbing at sunrise! You're incredible.",
   "Let the morning warm your hands. You've got a beautiful finish ahead!",
   "Breathe in the morning air. Let's finish this thing!"
  ],
  "checkin": [
   "It's check-in time, love! A nice little walk to stretch your legs.",
   "Go check in and grab a snack while you're there!",
   "Check-in window is open. Wave to everyone! You're doing so well.",
   "A quick check-in, then back to the fun!"
  ],
  "hard": [
   "Up next: {next}. You're strong enough for it, love!",
   "{next}. You're ready for it!",
   "Trust yourself, breathe, and enjoy the moves!",
   "You're ready for {next}. Go show it who's boss!",
   "Take your time on {next}. I believe in you!",
   "{next} is hard, and beautiful. Go have fun!"
  ],
  "goal": [
   "You did it! I knew you would! Everything from here is pure joy.",
   "Goal reached! I'm so incredibly proud of you!",
   "You did it, love! Every lap from here is a bonus.",
   "Look what you accomplished! You're amazing!",
   "That's your goal, done! Now climb just for the love of it.",
   "I always believed in you. Now you know why!",
   "You set a goal and you met it. That's beautiful!",
   "Celebrate this, darling! You worked so hard for it."
  ],
  "lastHour": [
   "Last hour, love! Empty the tank!",
   "This is the last stretch. Make it your best one!",
   "This is it, darling! Finish strong and finish proud!",
   "Every lap now is pure gold. Go get it!",
   "Leave it all on the rock! You'll never regret it.",
   "The finish is so close! I'm cheering for every move.",
   "One final push! You've got so much more in you than you think.",
   "Enjoy this last stretch. You've earned every second of it!"
  ],
  "over": [
   "You did it! Every single lap was beautiful, and I loved watching you.",
   "It's over, love! Rest, eat, and be so proud of yourself.",
   "What a day! You were brave the whole way through.",
   "I'm so proud of you! Go hug {partner}!",
   "Thank you for letting me climb with you today!",
   "Sleep well, darling. You earned it!"
  ],
  "switch_on": [
   "I'm here, love! Let's do this together.",
   "Hello, darling! Let's take a breath and keep going.",
   "You don't have to listen to him. I'm right here!"
  ],
  "switch_off": [
   "I'll be right here if you need me!",
   "Don't let him get to you. You're wonderful!",
   "Go show him he's wrong! I believe in you."
  ]
 }
};
