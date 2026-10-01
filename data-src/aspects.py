# Aspect / sun table, keyed by Mountain Project area (route-level) with comp-zone fallback.
# aspect: compass direction the wall faces. basis: 'MP' = stated in MP area description; 'geo' = inferred from canyon side / name.
MP_AREA = {
 # West side of the canyon: long east-facing cliff line; MP: "tends toward shade throughout the day"
 'Crackhouse Alley':      ('E',  'MP',  'Lots of shade (MP).'),
 'Confederate Cracks':    ('E',  'geo', 'West-side cliff line; east-facing, trends shady.'),
 'Walls Of Moria':        ('E',  'geo', 'Stays wet after rain (MP).'),
 'Hanging Gardens':       ('E',  'geo', 'West-side cliff line.'),
 'The Arcade':            ('NE', 'MP',  'Shady most of the day; faces NE (MP).'),
 'Street Fighter Wall':   ('NE', 'geo', 'Next to the Arcade; likely similar NE aspect.'),
 'Prophecy Wall':         ('E',  'geo', 'West-side cliff line.'),
 'Titanic Boulder':       ('E',  'geo', 'Freestanding block below the west side; faces vary.'),
 'Titanic Wall':          ('E',  'geo', 'West-side cliff line.'),
 'The Doomsday Wall':     ('E',  'MP',  'Good morning sun (MP).'),
 'Spooky Dooky Wall':     ('E',  'MP',  'Short, shady, east-facing (MP).'),
 'Ren and Stimpy':        ('E',  'MP',  'Shady area (MP).'),
 # North side: generally south-facing
 'North Forty Routes':    ('S',  'MP',  'Generally south-facing with exceptions; can chase shade (MP).'),
 'Kindergarten Boulder':  ('S',  'geo', 'Freestanding boulder on the north side; faces vary.'),
 'The Land Beyond Routes':('SE', 'MP',  'Generally east-facing; morning and afternoon sun (MP).'),
 # East side of the canyon: long west-facing cliff line
 'Roman Wall':            ('W',  'MP',  'Afternoon sun (MP).'),
 'New Roman Wall':        ('W',  'MP',  'Sun in afternoon and evening (MP).'),
 'Warthog Wall':          ('S',  'MP',  'South-facing gray wall left of Roman Wall (MP).'),
 'Mexican Pillar':        ('W',  'geo', 'East-side cliff line.'),
 'Goat Cave':             ('SE', 'MP',  'Shade in the afternoon (MP); cave roof stays shaded.'),
 'The Far East':          ('W',  'geo', 'East-side cliff line.'),
 'Magoo Rock':            ('W',  'geo', 'East-side cliff line.'),
 'Mullet Buttress':       ('W',  'geo', 'East-side cliff line.'),
 'Land of the Lost':      ('W',  'MP',  'Gets little sun and is damp (MP).'),
 'Cliffs of Insanity':    ('SW', 'MP',  'Baked by sun in summer (MP).'),
 'Wrangler Wall':         ('W',  'geo', 'East-side cliff line.'),
 'The Tool Buttress':     ('SW', 'MP',  'Sunny (MP).'),
 "Rosie's Cantina Area":  ('W',  'geo', 'Middle East section of the east side.'),
 'Nipple Stimulation Alcove': ('W','geo','Middle East section of the east side.'),
 'Super Slab':            ('W',  'geo', 'Middle East section of the east side.'),
 'Jungle Cliff':          ('W',  'geo', 'New Meadow; shady belay area (MP).'),
 # Valley floor
 'The Park':              ('shade','MP','Shady jumble of boulders by the Trading Co. (MP).'),
 'The Carrion Cube':      ('mixed','geo','Freestanding block on the valley floor.'),
}
# shade modifiers: MP says these stay shadier than aspect alone predicts
SHADY = {'Crackhouse Alley','The Arcade','Spooky Dooky Wall','Ren and Stimpy','Land of the Lost','The Park','Goat Cave','Street Fighter Wall'}
COMP_ZONE = {  # fallback when a comp route has no MP match
 'The Park':'The Park','The Westside Pt. 1':'Crackhouse Alley','The Westside Pt. 2':'Confederate Cracks',
 'Walls of Moria':'Walls Of Moria','The Black Slabs':'Walls Of Moria','The Arcade':'The Arcade',
 'Street Fighter Wall':'Street Fighter Wall','Ren and Stimpy':'Ren and Stimpy','Prophecy Wall':'Prophecy Wall',
 'Titanic Boulder':'Titanic Boulder','Doomsday Wall':'The Doomsday Wall','Spooky Dookie':'Spooky Dooky Wall',
 'Cooridor Area':'North Forty Routes','Circus Wall':'North Forty Routes','The Walls of Controversy':'North Forty Routes',
 'Crimp Scampi Area':'North Forty Routes','Groovy Area':'North Forty Routes','Kindergarten Boulder':'Kindergarten Boulder',
 'Wall of Early Morning Light':'The Land Beyond Routes','The Land Beyond':'The Land Beyond Routes','Goat Cave':'Goat Cave',
 'Mullet Buttress':'Mullet Buttress','Land of the Lost':'Land of the Lost','New Meadow':'Jungle Cliff',
 'Middle East':"Rosie's Cantina Area",'Magoo Rock':'Magoo Rock','Wrangler Wall':'Wrangler Wall','Roman Wall':'Roman Wall',
 'Cliffs of Insanity':'Cliffs of Insanity','Far East':'The Far East','The Carrion Cube':'The Carrion Cube',
}
MP_GPS = {  # area GPS from MP; entries equal to the ranch root (36.0118,-93.2922) are placeholders and left blank
 'Crackhouse Alley':(35.99981,-93.29369),'Confederate Cracks':(36.00132,-93.29346),'Walls Of Moria':(36.00196,-93.29396),
 'Hanging Gardens':(36.00264,-93.29433),'The Arcade':(36.00314,-93.2947),'Street Fighter Wall':(36.00343,-93.29512),
 'Prophecy Wall':(36.00388,-93.29631),'Titanic Boulder':(36.0053,-93.2973),'Titanic Wall':(36.0053,-93.2974),
 'The Doomsday Wall':(36.00556,-93.29739),'Spooky Dooky Wall':(36.0078,-93.29805),'North Forty Routes':(36.00881,-93.29549),
 'Kindergarten Boulder':(36.00878,-93.29377),'The Land Beyond Routes':(36.00982,-93.29337),'Roman Wall':(36.00546,-93.2851),
 'New Roman Wall':(36.00568,-93.28545),'Warthog Wall':(36.00554,-93.28526),'Mexican Pillar':(36.00506,-93.28468),
 'Goat Cave':(36.01125,-93.2879),'The Far East':(36.00423,-93.28429),'Magoo Rock':(36.00549,-93.2861),
 'Cliffs of Insanity':(36.0049,-93.2846),'Wrangler Wall':(36.00586,-93.28586),'The Tool Buttress':(36.0071,-93.2875),
 "Rosie's Cantina Area":(36.00644,-93.28695),'Nipple Stimulation Alcove':(36.00674,-93.28721),'Super Slab':(36.00712,-93.28802),
 'Jungle Cliff':(36.00815,-93.28731),'The Park':(36.00179,-93.29125),'The Carrion Cube':(36.00483,-93.29054),
}

# Mountain Project lists only the ranch's root coordinates for these walls.
# Estimated from the comp's walking order between neighbouring walls; refine with GPS on a scouting trip.
MP_GPS_EST = {
 'Mullet Buttress': (36.0102, -93.2878),     # between Goat Cave and Land of the Lost
 'Land of the Lost': (36.0092, -93.2876),    # between Mullet Buttress and New Meadow
 'Ren and Stimpy': (36.00365, -93.2957),     # between Street Fighter Wall and Prophecy Wall
}

# Comp zone (scorecard section) -> app zone index 0-23.
# Confirmed from Zack's 2026 zone counts: 0,4-12,14,16,20,23. Others are a provisional guess (ZONE_PROVISIONAL).
ZONE_OF = {
 'The Park': 0, 'The Westside Pt. 1': 0, 'The Westside Pt. 2': 1, 'Walls of Moria': 2, 'The Black Slabs': 2,
 'The Arcade': 3, 'Street Fighter Wall': 4, 'Ren and Stimpy': 5, 'Prophecy Wall': 6, 'Titanic Boulder': 7,
 'Doomsday Wall': 8, 'Spooky Dookie': 9, 'Cooridor Area': 10, 'Circus Wall': 10, 'Kindergarten Boulder': 11,
 'Wall of Early Morning Light': 11, 'Crimp Scampi Area': 12, 'The Walls of Controversy': 13, 'Groovy Area': 13,
 'The Land Beyond': 14, 'Goat Cave': 15, 'Mullet Buttress': 16, 'Land of the Lost': 16, 'New Meadow': 17,
 'Middle East': 18, 'Magoo Rock': 19, 'Wrangler Wall': 20, 'Roman Wall': 21, 'Cliffs of Insanity': 22,
 'Far East': 23, 'The Carrion Cube': 0,
}
ZONE_CONFIRMED = {0, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 23}
ZONE_PROVISIONAL_WALLS = {'The Park', 'The Carrion Cube', 'Mullet Buttress', 'The Black Slabs'}  # wall placement unconfirmed even within a confirmed zone
SPECIALS = {10: 'Hickadelic Jazzgrass', 651: 'Orange Crush'}
