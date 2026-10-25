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
