/*
 * What the voice is given, checked without a phone.
 *
 *   tests/spoken.test.sh
 *
 * Spoken.kt has no Android imports, which is the whole reason it is its own file: it
 * compiles and runs on a desktop JVM, so a hundred rewriting rules can be checked against
 * a hundred written-out answers instead of being listened to one at a time on a Fire
 * Stick. A wrong rule in there is wrong silently - it says something daft once, out loud,
 * and nothing writes it down - so the checking has to happen here or it does not happen.
 *
 * Each case is a before and an after. Where a case looks oddly specific it is because the
 * input is real: lifted off the feeds the app actually reads.
 */

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
