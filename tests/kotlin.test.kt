/*
 * The rules that need no phone, checked without one.
 *
 *   tests/kotlin.test.sh
 *
 * Spoken.kt and Edition.kt have no Android imports, which is the whole reason they are
 * their own files: they compile and run on a desktop JVM, so the rules can be checked
 * against written-out answers instead of being listened to one at a time on a Fire Stick.
 * Both are wrong silently when they are wrong - one says something daft once, out loud,
 * with nothing writing it down; the other drops a headline nobody notices was missing -
 * so the checking happens here or it does not happen at all.
 *
 * Each case is a before and an after. Where a case looks oddly specific it is because the
 * input is real: lifted off the feeds the app actually reads.
 */

import com.callum.newsdesk.Edition
import com.callum.newsdesk.Spoken
import com.callum.newsdesk.Threads
import kotlin.system.exitProcess

private var checks = 0
private val failures = ArrayList<String>()
private val areas = LinkedHashSet<String>()
private var area = ""

private fun suite(name: String) { area = name; areas.add(name) }

private fun says(input: String, want: String) {
    checks++
    val got = Spoken.forVoice(input)
    if (got != want) {
        failures.add("$area\n      given  ${show(input)}\n      wanted ${show(want)}\n      got    ${show(got)}")
    }
}

/** Unchanged: the rule that must not fire. Half of these rules earn their keep by not firing. */
private fun leaves(input: String) = says(input, input)

private fun show(s: String) = "\"" + s.replace("\n", "\\n") + "\""

/* ---------- Reading an edition back ---------- */

private fun part(parts: List<Edition.Part>, key: String): Edition.Part? = parts.firstOrNull { it.key == key }
private fun text(parts: List<Edition.Part>, key: String): String = part(parts, key)?.text ?: ""

/** The parts that are there, in the order they are read. */
private fun keys(parts: List<Edition.Part>, want: String) {
    checks++
    val got = parts.joinToString(", ") { it.key }
    if (got != want) failures.add("$area\n      wanted parts [$want]\n      got    [$got]")
}

private fun titled(parts: List<Edition.Part>, key: String, want: String) {
    checks++
    val got = part(parts, key)?.title
    if (got != want) failures.add("$area\n      $key is titled ${show(got ?: "")}, wanted ${show(want)}")
}

private fun begins(parts: List<Edition.Part>, key: String, want: String) {
    checks++
    val got = text(parts, key)
    if (!got.startsWith(want)) failures.add("$area\n      $key does not open with ${show(want)}\n      opens ${show(got.take(60))}")
}

private fun holds(parts: List<Edition.Part>, key: String, want: String) {
    checks++
    val got = text(parts, key)
    if (!got.contains(want)) failures.add("$area\n      $key is missing ${show(want)}\n      has   ${show(got)}")
}

private fun lacks(parts: List<Edition.Part>, key: String, want: String) {
    checks++
    val got = text(parts, key)
    if (got.contains(want)) failures.add("$area\n      $key should not contain ${show(want)}\n      has ${show(got)}")
}

private fun yes(b: Boolean) { checks++; if (!b) failures.add("$area\n      wanted it treated as already said") }
private fun no(b: Boolean) { checks++; if (b) failures.add("$area\n      wanted it kept, not treated as already said") }


/* ---------- One story or two ---------- */

/* A plausible archive. These are counts of how many stories have ever contained each
   word, which is the only thing that lets "hereford" be known to be worthless and
   "austen" to be decisive. A word absent from here has never been seen at all, which
   makes it the best evidence there is. */
private val SEEN = mapOf(
    "hereford" to 400, "council" to 300, "police" to 250, "road" to 120,
    "leominster" to 90, "fire" to 70, "homes" to 60, "bill" to 55,
    "power" to 40, "arrests" to 30, "storm" to 25, "closure" to 20,
    "extended" to 18, "western" to 15, "reopens" to 12, "water" to 45,
    "quake" to 5, "dinmore" to 4, "a303" to 3, "a49" to 8,
    "austen" to 2, "tibet" to 2
)

private fun joins(title: String, thread: String, want: Boolean, why: String) {
    checks++
    val got = Threads.joins(Threads.words(title), Threads.words(thread), SEEN)
    if (got != want) {
        val (total, shared) = Threads.score(Threads.words(title), Threads.words(thread), SEEN)
        failures.add("$area\n      " + why +
            "\n      " + show(title) + "\n      against " + show(thread) +
            "\n      wanted " + (if (want) "one thread" else "two") +
            ", scored $total on $shared words")
    }
}

fun main() {

    suite("Money")
    says("£3.011tn", "3.011 trillion pounds")
    says("£3.4bn", "3.4 billion pounds")
    says("£500m", "500 million pounds")
    says("£20k", "20 thousand pounds")
    says("£63,065", "63,065 pounds")
    says("£81.98", "81 pounds 98")
    says("$1.2bn", "1.2 billion dollars")
    says("€40", "40 euros")
    says("Bitcoin is £63,065 today", "Bitcoin is 63,065 pounds today")
    says("a £2m grant", "a 2 million pounds grant")
    says("50p a litre", "50 pence a litre")
    // A figure is never rounded. Clumsy is better than a bulletin quietly changing a number.
    says("£3.011tn of debt", "3.011 trillion pounds of debt")

    suite("Bare magnitudes")
    says("2.5tn tonnes", "2.5 trillion tonnes")
    says("1.4bn people", "1.4 billion people")
    // m and k are left alone without a currency symbol in front: a 100m sprint is not
    // a hundred million of anything, and 5k is as likely to be a run as a sum.
    leaves("the 100m final")
    leaves("a 5k run")

    suite("Per cent and degrees")
    says("3.5%", "3.5 per cent")
    says("down 1.5% today", "down 1.5 per cent today")
    says("9°C", "9 degrees")
    says("9°", "9 degrees")
    says("-3°C overnight", "minus 3 degrees overnight")

    suite("The clock")
    says("05:04", "5:04 am")
    says("14:30", "2:30 pm")
    says("19:00", "7 pm")
    says("00:30", "12:30 am")
    says("12:15", "12:15 pm")
    says("written at 05:04 this morning", "written at 5:04 am this morning")
    says("7:30pm at the Barrels", "7:30 pm at the Barrels")
    // Not every colon is a clock. A scoreline has one digit after it, a time has two.
    leaves("winning 3:1")

    suite("Roads")
    says("A303", "A three oh three")
    says("the A49 at Dinmore", "the A 49 at Dinmore")
    says("M5", "M 5")
    says("B4361", "B four three six one")
    says("the A303 reopens", "the A three oh three reopens")

    suite("Ampersands and short forms")
    says("A&E", "A and E")
    says("M&S", "M and S")
    says("approx. 40,000 homes", "approximately 40,000 homes")
    says("No. 10", "number 10")
    says("Hereford vs Shrewsbury", "Hereford versus Shrewsbury")
    says("70mph winds", "70 miles per hour winds")
    says("e.g. the cathedral", "for example the cathedral")
    // The reason the short forms are matched with boundaries and not as plain text.
    leaves("engine revs")
    leaves("Elvis")
    leaves("Novo")

    suite("Units")
    says("9km away", "9 kilometres away")
    says("40kg of brass", "40 kilograms of brass")
    leaves("Kmart")

    suite("Punctuation the engine cannot hear")
    says("power — most of it restored", "power, most of it restored")
    says("power – most of it", "power, most of it")
    says("Western Power (the operator) says", "Western Power, the operator, says")
    says("and then… nothing", "and then, nothing")
    says("He said “no”", "He said no")
    says("it’s here", "it's here")
    says("**Storm Austen** came in", "Storm Austen came in")
    says("- a bulleted line", "a bulleted line")
    says("a claim[1] made", "a claim made")

    suite("Addresses")
    says("see https://bosh.tv/recipes for more", "see for more")
    says("bosh.tv/recipes", "bosh dot tv")
    says("noracooks.com", "noracooks dot com")
    says("hello@example.org", "hello at example dot org")

    suite("Ranges")
    says("10-15 people", "10 to 15 people")
    says("the 2024-25 season", "the 2024 to 25 season")

    suite("Paragraphs survive")
    // split() chunks on newlines further down the line, so a rule that matches across one
    // welds two paragraphs together and costs the listener the pause between them.
    says("One thing.\nTwo thing.", "One thing.\nTwo thing.")
    says("One thing.\n\nTwo thing.", "One thing.\n\nTwo thing.")
    says("Ends on a dash —\nAnd carries on", "Ends on a dash\nAnd carries on")
    says("  padded  \n  lines  ", "padded\nlines")

    suite("Left alone")
    // The great majority of a news sentence must come out the other side untouched.
    leaves("Around 40,000 homes across Herefordshire lost power overnight.")
    leaves("The BBC reported that the NHS in the UK had agreed a deal.")
    leaves("Storm Austen cuts power as Tibet quake kills 16")
    leaves("")

    suite("Never throws")
    checks++
    try {
        Spoken.forVoice("£".repeat(400) + "\n" + "(".repeat(400) + "—".repeat(400))
        Spoken.forVoice("£99:99:99tn%%%°°")
    } catch (e: Exception) {
        failures.add("Never throws: threw " + e)
    }

    /* ---------- The running order ---------- */

    val storm = "Storm Austen cuts power as Tibet quake kills 16\n" +
        "Around 40,000 homes across Herefordshire and the Marches lost power overnight " +
        "as Storm Austen came in off the Atlantic. Western Power says most should be " +
        "reconnected by this evening."

    suite("An edition is four parts, in order")
    run4@ run {
        val parts = Edition.build(
            "Morning briefing",
            "Storm Austen cuts power as Tibet quake kills 16",
            listOf("Around 40,000 homes across Herefordshire lost power overnight."),
            listOf(
                Edition.Head("Hereford Times", "A303 reopens after three days shut"),
                Edition.Head("Citadel Wire", "Miners move record hashrate to Paraguay")
            ),
            listOf(Edition.Slot("Today, 10:00", "Farmers' market, High Town")),
            "Bitcoin £63,065, down 1.5% today.",
            "9°, showers"
        )
        keys(parts, "brief, heads, on, markets")
        titled(parts, "brief", "Morning briefing")
        titled(parts, "heads", "The other headlines")
        titled(parts, "on", "What's on today")
        titled(parts, "markets", "Markets and the weather")
        begins(parts, "heads", "The other headlines.")
        begins(parts, "on", "What's on today.")
        begins(parts, "markets", "Markets and the weather.")
        // Said as a sentence, with the source in front of it and a stop at the end.
        holds(parts, "heads", "Hereford Times. A303 reopens after three days shut.")
        holds(parts, "on", "Today, 10:00. Farmers' market, High Town.")
        holds(parts, "markets", "Bitcoin £63,065, down 1.5% today.")
        holds(parts, "markets", "9°, showers.")
    }

    suite("Nothing empty is announced and then not delivered")
    run {
        val bare = Edition.build("", "", emptyList(), emptyList(), emptyList(), "", "")
        checks++
        if (bare.isNotEmpty()) failures.add("$area\n      an edition of nothing has ${bare.size} parts")
        // The API being down costs the briefing, not the bulletin.
        val noBrief = Edition.build("", "", emptyList(),
            listOf(Edition.Head("BBC", "Two arrests after Leominster fire")),
            emptyList(), "", "9°, showers")
        keys(noBrief, "heads, markets")
        // And a briefing with no feed behind it is still worth playing.
        val onlyBrief = Edition.build("Morning briefing", "A headline",
            listOf("A paragraph."), emptyList(), emptyList(), "", "")
        keys(onlyBrief, "brief")
    }

    suite("Nothing is read out twice in one sitting")
    run {
        // Same story, little shared phrasing: a briefing writes its own sentences.
        yes(Edition.covered("Storm Austen cuts power to 40,000 homes", storm))
        yes(Edition.covered("Tibet quake death toll reaches 16", storm))
        // Different stories, which must survive.
        no(Edition.covered("A303 reopens after three days shut", storm))
        no(Edition.covered("Cathedral organ recital this afternoon", storm))
        no(Edition.covered("Miners move record hashrate to Paraguay", storm))
        // Too little to judge on. Read twice is a smaller fault than wrongly dropped.
        no(Edition.covered("Austen", storm))
        no(Edition.covered("Power cut", storm))
        no(Edition.covered("Storm Austen", storm))
        // Nothing to compare against.
        no(Edition.covered("A303 reopens after three days shut", ""))
        /* A known miss, written down rather than left to be discovered. This is the same
           storm in words that share almost nothing with it, and the rule lets it through.
           It is the right way round to be wrong: this costs one daft repetition, and
           tightening the rule until it caught this would start dropping new stories,
           which costs something you never learn you missed. */
        no(Edition.covered("Tens of thousands without power as Austen hits", storm))

        /* And the rule actually applied, not merely available: the headline the briefing
           has just told at length is the one that makes a bulletin sound like it is not
           listening to itself. */
        val parts = Edition.build("Morning briefing",
            "Storm Austen cuts power as Tibet quake kills 16",
            listOf("Around 40,000 homes across Herefordshire and the Marches lost power " +
                   "overnight as Storm Austen came in off the Atlantic."),
            listOf(
                Edition.Head("BBC", "Storm Austen leaves 40,000 homes without power"),
                Edition.Head("Hereford Times", "A303 reopens after three days shut")
            ),
            emptyList(), "", "")
        lacks(parts, "heads", "without power")
        holds(parts, "heads", "A303 reopens after three days shut.")
    }

    suite("A bulletin, not a list")
    run {
        val many = (1..12).map { Edition.Head("Source $it", "Distinct headline number $it today") }
        val slots = (1..9).map { Edition.Slot("Today, 1$it:00", "Thing number $it happening") }
        val parts = Edition.build("Morning briefing", "A headline", listOf("A paragraph."),
            many, slots, "", "")
        checks++
        val heads = text(parts, "heads").split("\n").size - 1
        if (heads != 5) failures.add("$area\n      wanted 5 headlines, got $heads")
        checks++
        val on = text(parts, "on").split("\n").size - 1
        if (on != 4) failures.add("$area\n      wanted 4 diary entries, got $on")
    }

    suite("Nothing is read out twice across a day")
    run {
        val heads = listOf(
            Edition.Head("BBC", "Two arrests after Leominster fire"),
            Edition.Head("Hereford Times", "A303 reopens after three days shut")
        )
        /* Read out this morning. Not in the briefing, so only the day's record can
           keep it out of the afternoon. */
        val said = listOf("Two arrests after Leominster fire")
        val parts = Edition.build("Afternoon briefing", "Something else entirely",
            listOf("A paragraph about something else."), heads, emptyList(), "", "", said)
        lacks(parts, "heads", "Leominster fire")
        holds(parts, "heads", "A303 reopens after three days shut.")

        // Paraphrase too, not only the same words over again.
        val para = Edition.build("Afternoon briefing", "Something else entirely",
            listOf("A paragraph."), heads, emptyList(), "", "",
            listOf("Leominster fire: two people arrested"))
        lacks(para, "heads", "Leominster fire")

        /* Compared one headline against one, never against all of them run together.
           By evening that blob is enormous, and a forty per cent overlap against a wall
           of text would start dropping genuinely new stories - which is the failure
           nobody ever finds out about. This is that blob, and the new story survives it. */
        val allDay = listOf(
            "Storm Austen cuts power to 40,000 homes",
            "Tibet quake death toll reaches 16",
            "Lords vote down the water bill amendment",
            "Miners move record hashrate to Paraguay",
            "Oat milk duty cut survives the budget",
            "Cathedral organ recital draws a record crowd",
            "Farmers market moves to High Town for winter"
        )
        val late = Edition.build("Evening briefing", "A quiet day", listOf("Not much."),
            listOf(Edition.Head("Hereford Times", "A303 reopens after three days shut")),
            emptyList(), "", "", allDay)
        holds(late, "heads", "A303 reopens after three days shut.")

        /* The case that actually tells the two apart, and the reason this one is written
           out so carefully: every content word of this headline appears somewhere in the
           day's record, but spread across four different entries - power from the storm,
           cut from the oat milk, cathedral from the recital, market from the farmers'.
           Against any single headline it shares one word in four and survives. Run
           together into one blob it scores four in four and is dropped, though nobody has
           said it. A headline sharing no words at all with the blob cannot show this;
           the first version of this test used one and passed either way. */
        val spread = Edition.build("Evening briefing", "A quiet day", listOf("Not much."),
            listOf(Edition.Head("Hereford Times", "Power cut at the cathedral market")),
            emptyList(), "", "", allDay)
        holds(spread, "heads", "Power cut at the cathedral market.")

        // And what it did read is written down, or there is nothing to skip tomorrow.
        checks++
        val h = part(parts, "heads")
        if (h == null || h.titles != listOf("A303 reopens after three days shut")) {
            failures.add("$area\n      the headlines part should record what went into it" +
                "\n      got    " + (h?.titles ?: "no part at all"))
        }
        // The other parts carry none, having no headlines in them.
        val full = Edition.build("Morning briefing", "A headline", listOf("A paragraph."),
            heads, listOf(Edition.Slot("Today, 10:00", "Market")), "Bitcoin 1 pound.", "9 degrees")
        checks++
        val stray = full.filter { it.key != "heads" && it.titles.isNotEmpty() }.map { it.key }
        if (stray.isNotEmpty()) failures.add("$area\n      these carry headlines and should not: $stray")
    }

    suite("Stopping half way picks up where it stopped")
    run {
        val parts = Edition.build("Morning briefing", "A headline", listOf("A paragraph."),
            listOf(Edition.Head("BBC", "Distinct enough headline about something")),
            listOf(Edition.Slot("Today, 10:00", "Market")), "Bitcoin 1 pound.", "9 degrees")
        keys(parts, "brief, heads, on, markets")

        keys(Edition.remaining(parts, emptyList()), "brief, heads, on, markets")
        keys(Edition.remaining(parts, listOf("brief")), "heads, on, markets")
        keys(Edition.remaining(parts, listOf("brief", "heads")), "on, markets")
        // Out of order, because a skip can finish a later part first.
        keys(Edition.remaining(parts, listOf("on")), "brief, heads, markets")
        // A key from an edition that no longer has that part is simply not there.
        keys(Edition.remaining(parts, listOf("nothing")), "brief, heads, on, markets")

        /* Heard the lot and pressed play: the only thing that can mean is again. A button
           that does nothing would be worse than a repeat that was asked for. */
        keys(Edition.remaining(parts, listOf("brief", "heads", "on", "markets")),
            "brief, heads, on, markets")
        checks++
        if (Edition.remaining(emptyList(), listOf("brief")).isNotEmpty()) {
            failures.add("$area\n      nothing to play should stay nothing")
        }
    }

    suite("Nothing is offered aloud that cannot be read")
    run {
        val hour = 3600L * 1000L
        val now = 1_761_000_000_000L
        checks++
        if (Edition.SHOW_HOURS != 36) failures.add("$area\n      the window should match the screen's 36 hours")
        yes(Edition.stale(0L, now))                               // never written
        yes(Edition.stale(now - 37 * hour, now))                  // past the window
        no(Edition.stale(now - 35 * hour, now))                   // inside it
        no(Edition.stale(now, now))                               // written this instant
        // Exactly on the boundary is still shown, as the screen shows it.
        no(Edition.stale(now - 36 * hour, now))
        // A clock that has gone backwards is not a reason to withhold anything.
        no(Edition.stale(now + hour, now))
    }

    suite("How long it runs")
    run {
        checks++
        if (Edition.seconds(emptyList()) != 0) failures.add("$area\n      nothing should run for no time")
        // 170 words a minute, so 170 words is a minute and 85 is half of one.
        val one = listOf(Edition.Part("x", "x", (1..170).joinToString(" ") { "word" }))
        checks++
        val got = Edition.seconds(one)
        if (got != 60) failures.add("$area\n      wanted 170 words to run 60s, got ${got}s")
        val half = listOf(Edition.Part("x", "x", (1..85).joinToString(" ") { "word" }))
        checks++
        val h = Edition.seconds(half)
        if (h != 30) failures.add("$area\n      wanted 85 words to run 30s, got ${h}s")
        // Counted across every part, not just the first.
        checks++
        val both = Edition.seconds(one + half)
        if (both != 90) failures.add("$area\n      wanted the parts added up to 90s, got ${both}s")
        // Newlines are not words.
        checks++
        val lines = Edition.seconds(listOf(Edition.Part("x", "x", "one\n\ntwo\n   \nthree")))
        val words = Edition.seconds(listOf(Edition.Part("x", "x", "one two three")))
        if (lines != words) failures.add("$area\n      blank lines counted as words: ${lines}s vs ${words}s")
    }

    suite("The edition goes to the voice through the same rules as everything else")
    run {
        /* Not a rule of its own: the parts are spoken through Speaker.split, so they get
           Spoken.forVoice like an article does. Checked here because the running order
           writes figures and times straight out of the page's own phrasing. */
        says("Bitcoin £63,065, down 1.5% today.", "Bitcoin 63,065 pounds, down 1.5 per cent today.")
        says("9°, showers.", "9 degrees, showers.")
        says("Today, 10:00. Farmers' market, High Town.",
             "Today, 10 am. Farmers' market, High Town.")
        says("Hereford Times. A303 reopens after three days shut.",
             "Hereford Times. A three oh three reopens after three days shut.")
    }

    /* ---------- Threads ---------- */

    suite("A word is worth what it is rare")
    run {
        val bands = listOf(0 to 4, 2 to 4, 3 to 3, 10 to 3, 11 to 2, 50 to 2,
                           51 to 1, 200 to 1, 201 to 0, 5000 to 0)
        bands.forEach { (seen, want) ->
            checks++
            val got = Threads.weight(seen)
            if (got != want) failures.add("$area\n      a word in $seen stories is worth $got, wanted $want")
        }
        // Never seen before is the strongest evidence there is, not the weakest.
        checks++
        if (Threads.weight(0) != 4) failures.add("$area\n      a word never seen should carry the most")
    }

    suite("The words of a headline worth comparing")
    run {
        checks++
        val w = Threads.words("The A49 at Dinmore reopens after 3 days shut")
        val want = listOf("a49", "dinmore", "reopens", "days", "shut")
        if (w != want) failures.add("$area\n      wanted $want\n      got    $w")
        // Road numbers kept: they are most of the local news and the most distinctive
        // thing in it. Two-letter wreckage from splitting on punctuation dropped.
        checks++
        if (!Threads.words("Crash on the B4361").contains("b4361")) {
            failures.add("$area\n      a road number is not optional")
        }
        checks++
        if (Threads.words("Power cut, power restored") != listOf("power", "cut", "restored")) {
            failures.add("$area\n      a word twice over is still one word")
        }
        checks++
        if (Threads.words("").isNotEmpty()) failures.add("$area\n      nothing has no words in it")
    }

    suite("Two stories are one story")
    run {
        joins("Storm Austen cuts power to 40,000 homes",
            "Storm Austen hits: Western Power says 40,000 homes are off", true,
            "the same storm, two papers")
        joins("A49 closure at Dinmore extended into next week",
            "A49 shut at Dinmore after lorry crash", true,
            "the same closure, four days on")
        // A word never seen before is decisive, which is the point of counting them.
        joins("Whitney-on-Wye flood defences fail",
            "Flood warning for Whitney-on-Wye as the Wye rises", true,
            "three words none of which the archive has ever seen")
    }

    suite("Two stories are not one story")
    run {
        /* The case this whole design exists for, written so that it actually depends on
           it. Six words in common - hereford, council, police, road, leominster, fire -
           and two entirely different stories. Were common words worth even one point
           each, six of them would clear the threshold exactly and these two would be
           welded together, which is how overlap alone turns the whole local feed into
           one thread while looking like the feature working.
           
           The first version of this case shared two common words, scored two, and was
           saved by the threshold rather than by the weighting - so it passed with the
           zero band removed and proved nothing about the thing it was named after. */
        joins("Hereford council and police warn of road closures near Leominster fire station",
            "Council and police in Hereford close a road at Leominster after fire", false,
            "six words of furniture in common, and nothing in common")

        /* One rare word in common is a coincidence, not a thread - and this is the
           coincidence that would actually happen. */
        joins("Austen Williams signs for Hereford FC",
            "Storm Austen hits: Western Power says 40,000 homes are off", false,
            "a man called Austen and a storm called Austen")

        /* And the invariant that case really rests on, asserted rather than assumed.
           SHARED_MIN is two, but with the best a word can be worth set at four and the
           threshold at six, one word could never clear it however rare - so SHARED_MIN
           is currently implied and the one-word case above would pass without it. This
           is the check that fails the moment that stops being true, which is the moment
           SHARED_MIN starts doing work. */
        checks++
        if (Threads.weight(0) >= Threads.SCORE_MIN) {
            failures.add("$area\n      one word, however rare, can now reach the threshold on its own" +
                " (" + Threads.weight(0) + " against " + Threads.SCORE_MIN + ")" +
                "\n      SHARED_MIN is what stops that, and the case above now needs it")
        }

        // Weak words only. A deliberate miss: a thread one instalment short is a fault
        // you would have to know the story well to see, while a thread that swallows an
        // unrelated story says out loud that two things are connected when they are not.
        joins("Road closure near Leominster fire station",
            "Leominster fire: road shut as crews attend", false,
            "three middling words is not evidence enough")

        joins("Power cut", "Storm Austen hits: Western Power says homes are off", false,
            "too little said to place it anywhere")
        joins("", "Storm Austen hits", false, "and nothing is not a thread")
    }

    suite("Which thread it belongs to")
    run {
        val storm = Threads.words("Storm Austen hits: Western Power says 40,000 homes are off")
        val road = Threads.words("A49 shut at Dinmore after lorry crash")
        val quake = Threads.words("Tibet quake: rescue continues")
        val all = listOf(storm, road, quake)

        checks++
        val a = Threads.place(Threads.words("Storm Austen: power back for most homes"), all, SEEN)
        if (a != 0) failures.add("$area\n      the storm story went to thread $a, wanted 0")
        checks++
        val b = Threads.place(Threads.words("A49 at Dinmore reopens"), all, SEEN)
        if (b != 1) failures.add("$area\n      the road story went to thread $b, wanted 1")
        checks++
        val c = Threads.place(Threads.words("Tibet quake death toll reaches 16"), all, SEEN)
        if (c != 2) failures.add("$area\n      the quake story went to thread $c, wanted 2")
        // A story of its own starts its own.
        checks++
        val d = Threads.place(Threads.words("Oat milk duty cut survives the budget"), all, SEEN)
        if (d != -1) failures.add("$area\n      an unrelated story joined thread $d, wanted none")
        checks++
        if (Threads.place(Threads.words("Storm Austen: power back"), emptyList(), SEEN) != -1) {
            failures.add("$area\n      with no threads to join, nothing is joined")
        }
    }

    val plural = if (checks == 1) "check" else "checks"
    if (failures.isEmpty()) {
        println("  $checks $plural in ${areas.size} areas, all good")
        exitProcess(0)
    }
    println("")
    for (f in failures) println("  FAILED  $f\n")
    println("  ${failures.size} of $checks $plural failed")
    exitProcess(1)
}
