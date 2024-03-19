/* eslint-disable indent */
import React, {
  useState,
  useEffect,
  useContext,
  useLayoutEffect
} from 'react'
import {
  View,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Platform,
  Alert
} from 'react-native'
import { useQuery } from '@apollo/client'
import gql from 'graphql-tag'
import { AntDesign, Feather } from '@expo/vector-icons'
import { Placeholder, PlaceholderLine, Fade } from 'rn-placeholder'
import CartItem from '../../components/CartItem/CartItem'
import { getTipping } from '../../apollo/queries'
import { scale } from '../../utils/scaling'
import { theme } from '../../utils/themeColors'
import { alignment } from '../../utils/alignment'
import ThemeContext from '../../ui/ThemeContext/ThemeContext'
import ConfigurationContext from '../../context/Configuration'
import UserContext from '../../context/User'
import styles from './styles'
import TextDefault from '../../components/Text/TextDefault/TextDefault'
import { useRestaurant } from '../../ui/hooks'
import { LocationContext } from '../../context/Location'
import EmptyCart from '../../assets/SVG/imageComponents/EmptyCart'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { DAYS } from '../../utils/enums'
import { textStyles } from '../../utils/textStyles'
import { calculateDistance } from '../../utils/customFunctions'
import analytics from '../../utils/analytics'
import { HeaderBackButton } from '@react-navigation/elements'
import navigationService from '../../routes/navigationService'
import { useTranslation } from 'react-i18next'
import Location from '../../components/Main/Location/Location'
import WouldYouLikeToAddThese from './Section'

// Constants
const TIPPING = gql`
  ${getTipping}
`

function Cart(props) {
  const Analytics = analytics()
  const navigation = useNavigation()
  const configuration = useContext(ConfigurationContext)
  const {
    isLoggedIn,
    profile,
    restaurant: cartRestaurant,
    cart,
    cartCount,
    addQuantity,
    removeQuantity
  } = useContext(UserContext)
  const themeContext = useContext(ThemeContext)
  const { location } = useContext(LocationContext)
  const currentTheme = theme[themeContext.ThemeValue]
  const { t } = useTranslation()
  const [loadingData, setLoadingData] = useState(true)
  const [minimumOrder, setMinimumOrder] = useState('')
  const [selectedRestaurant, setSelectedRestaurant] = useState({})
  const [deliveryCharges, setDeliveryCharges] = useState(0)
  const isCartEmpty = cart.length === 0
  const cartLength = !isCartEmpty ? cart.length : 0
  const { loading, data } = useRestaurant(cartRestaurant)

  const { loading: loadingTip, data: dataTip } = useQuery(TIPPING, {
    fetchPolicy: 'network-only'
  })

  const coupon =
    props.route.params && props.route.params.coupon
      ? props.route.params.coupon
      : null

  const tip =
    props.route.params && props.route.params.tipAmount
      ? props.route.params.tipAmount
      : null

  const [selectedTip, setSelectedTip] = useState()

  useEffect(() => {
    if (tip) {
      setSelectedTip(null)
    } else if (dataTip && !selectedTip) {
      setSelectedTip(dataTip.tips.tipVariations[1])
    }
  }, [tip, data])

  useEffect(() => {
    let isSubscribed = true
      ; (async() => {
        if (data && data?.restaurant) {
          const latOrigin = Number(data?.restaurant.location.coordinates[1])
          const lonOrigin = Number(data?.restaurant.location.coordinates[0])
          const latDest = Number(location.latitude)
          const longDest = Number(location.longitude)
          const distance = await calculateDistance(
            latOrigin,
            lonOrigin,
            latDest,
            longDest
          )
          const amount = Math.ceil(distance) * configuration.deliveryRate
          isSubscribed &&
            setDeliveryCharges(amount > 0 ? amount : configuration.deliveryRate)
        }
      })()
    return () => {
      isSubscribed = false
    }
  }, [data, location])

  useFocusEffect(() => {
    if (Platform.OS === 'android') {
      StatusBar.setBackgroundColor(currentTheme.themeBackground)
    }
    StatusBar.setBarStyle('dark-content')
  })

  useLayoutEffect(() => {
    props.navigation.setOptions({
      title: t('titleCart'),
      headerRight: null,
      headerTitleAlign: 'center',
      headerTitleStyle: {
        color: currentTheme.btnText,
        ...textStyles.H4,
        ...textStyles.Bolder
      },
      headerTitleContainerStyle: {
        paddingLeft: scale(25),
        paddingRight: scale(25),
        backgroundColor: currentTheme.transparent
      },
      headerStyle: {
        backgroundColor: currentTheme.themeBackground
      },
      headerLeft: () => (
        <HeaderBackButton
          truncatedLabel=""
          backImage={() => (
            <View
              style={{
                ...alignment.PLsmall,
                alignItems: 'center'
              }}>
              <AntDesign
                name="arrowleft"
                size={22}
                color={currentTheme.fontFourthColor}
              />
            </View>
          )}
          onPress={() => {
            navigationService.goBack()
          }}
        />
      )
    })
  }, [props.navigation])

  useLayoutEffect(() => {
    if (!data) return
    didFocus()
  }, [data])
  useEffect(() => {
    async function Track() {
      await Analytics.track(Analytics.events.NAVIGATE_TO_CART)
    }
    Track()
  }, [])
  useEffect(() => {
    if (cart && cartCount > 0) {
      if (
        data &&
        data.restaurant &&
        (!data.restaurant.isAvailable || !isOpen())
      ) {
        showAvailablityMessage()
      }
    }
  }, [data])

  const showAvailablityMessage = () => {
    Alert.alert(
      '',
      `${data.restaurant.name} closed at the moment`,
      [
        {
          text: 'Go back to restaurants',
          onPress: () => {
            props.navigation.navigate({
              name: 'Main',
              merge: true
            })
          },
          style: 'cancel'
        },
        {
          text: 'Continue',
          onPress: () => { },
          style: 'cancel'
        }
      ],
      { cancelable: true }
    )
  }

  function calculatePrice(delivery = 0, withDiscount) {
    let itemTotal = 0
    cart.forEach(cartItem => {
      const food = populateFood(cartItem)
      if (!food) return
      itemTotal += food.price * food.quantity
    })
    if (withDiscount && coupon && coupon.discount) {
      itemTotal = itemTotal - (coupon.discount / 100) * itemTotal
    }
    const deliveryAmount = delivery > 0 ? deliveryCharges : 0
    return (itemTotal + deliveryAmount).toFixed(2)
  }

  function calculateTotal() {
    let total = 0
    // const delivery = isPickedUp ? 0 : deliveryCharges
    total += +calculatePrice()
    // total += +taxCalculation()
    // total += +calculateTip()
    return parseFloat(total).toFixed(2)
  }

  const isOpen = () => {
    const date = new Date()
    const day = date.getDay()
    const hours = date.getHours()
    const minutes = date.getMinutes()
    const todaysTimings = data.restaurant.openingTimes.find(
      o => o.day === DAYS[day]
    )
    const times = todaysTimings.times.filter(
      t =>
        hours >= Number(t.startTime[0]) &&
        minutes >= Number(t.startTime[1]) &&
        hours <= Number(t.endTime[0]) &&
        minutes <= Number(t.endTime[1])
    )

    return times.length > 0
  }

  async function didFocus() {
    const { restaurant } = data
    setSelectedRestaurant(restaurant)
    setMinimumOrder(restaurant.minimumOrder)
    setLoadingData(false)
  }

  function emptyCart() {
    return (
      <View style={styles().subContainerImage}>
        <View style={styles().imageContainer}>
          <EmptyCart width={scale(200)} height={scale(200)} />
        </View>
        <View style={styles().descriptionEmpty}>
          <TextDefault textColor={currentTheme.fontMainColor} bolder center>
            {t('hungry')}?
          </TextDefault>
          <TextDefault textColor={currentTheme.fontSecondColor} bold center>
            {t('emptyCart')}
          </TextDefault>
        </View>
        <TouchableOpacity
          activeOpacity={0.7}
          style={styles(currentTheme).emptyButton}
          onPress={() =>
            props.navigation.navigate({
              name: 'Main',
              merge: true
            })
          }>
          <TextDefault
            textColor={currentTheme.buttonText}
            bolder
            B700
            center
            uppercase>
            {t('emptyCartBtn')}
          </TextDefault>
        </TouchableOpacity>
      </View>
    )
  }
  function loadginScreen() {
    return (
      <View style={styles(currentTheme).screenBackground}>
        <Placeholder
          Animation={props => (
            <Fade
              {...props}
              style={styles(currentTheme).placeHolderFadeColor}
              duration={600}
            />
          )}
          style={styles(currentTheme).placeHolderContainer}>
          <PlaceholderLine />
          <PlaceholderLine />
          <PlaceholderLine />
        </Placeholder>

        <Placeholder
          Animation={props => (
            <Fade
              {...props}
              style={styles(currentTheme).placeHolderFadeColor}
              duration={600}
            />
          )}
          style={styles(currentTheme).placeHolderContainer}>
          <PlaceholderLine style={styles().height60} />
          <PlaceholderLine />
        </Placeholder>

        <Placeholder
          Animation={props => (
            <Fade
              {...props}
              style={styles(currentTheme).placeHolderFadeColor}
              duration={600}
            />
          )}
          style={styles(currentTheme).placeHolderContainer}>
          <PlaceholderLine style={styles().height100} />
          <PlaceholderLine />
          <PlaceholderLine />
          <View
            style={[
              styles(currentTheme).horizontalLine,
              styles().width100,
              styles().mB10
            ]}
          />
          <PlaceholderLine />
          <PlaceholderLine />
        </Placeholder>
        <Placeholder
          Animation={props => (
            <Fade
              {...props}
              style={styles(currentTheme).placeHolderFadeColor}
              duration={600}
            />
          )}
          style={styles(currentTheme).placeHolderContainer}>
          <PlaceholderLine style={styles().height100} />
          <PlaceholderLine />
          <PlaceholderLine />
          <View
            style={[
              styles(currentTheme).horizontalLine,
              styles().width100,
              styles().mB10
            ]}
          />
          <PlaceholderLine />
          <PlaceholderLine />
        </Placeholder>
      </View>
    )
  }
  if (loading || loadingData || loadingTip) return loadginScreen()

  const { restaurant } = data
  const { addons, options } = restaurant
  const foods = restaurant.categories.map(c => c.foods.flat()).flat()

  function populateFood(cartItem) {
    const food = foods.find(food => food._id === cartItem._id)
    if (!food) return null
    const variation = food.variations.find(
      variation => variation._id === cartItem.variation._id
    )
    if (!variation) return null

    const title = `${food.title}${variation.title ? `(${variation.title})` : ''
      }`
    let price = variation.price
    const optionsTitle = []
    if (cartItem.addons) {
      cartItem.addons.forEach(addon => {
        const cartAddon = addons.find(add => add._id === addon._id)
        if (!cartAddon) return null
        addon.options.forEach(option => {
          const cartOption = options.find(opt => opt._id === option._id)
          if (!cartOption) return null
          price += cartOption.price
          optionsTitle.push(cartOption.title)
        })
      })
    }
    return {
      ...cartItem,
      optionsTitle,
      title: title,
      price: price.toFixed(2),
      image: food.image,
      addons: food.variations[0].addons
    }
  }

  return (
    <>
      <View style={styles(currentTheme).mainContainer}>
        {!cart.length && emptyCart()}
        {!!cart.length && (
          <>
            <ScrollView
              showsVerticalScrollIndicator={false}
              style={[styles().flex, styles().cartItems]}>
              <View style={[styles(currentTheme).headerContainer]}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  style={styles().locationContainer}
                  onPress={event => {
                    if (!profile.addresses.length) {
                      props.navigation.navigate('NewAddress', {
                        backScreen: 'Cart'
                      })
                    } else {
                      props.navigation.navigate('CartAddress', {
                        address: location
                      })
                    }
                  }}>
                  <View style={styles().location}>
                    <Location
                      locationIconGray={{
                        backgroundColor: currentTheme.newBorderColor,
                        borderWidth: 1,
                        borderColor: currentTheme.iconBackground,
                        width: 30,
                        height: 30
                      }}
                    />
                  </View>
                  <Feather
                    name="chevron-right"
                    size={20}
                    color={currentTheme.secondaryText}
                  />

                </TouchableOpacity>

              </View>
              <View
                style={{
                  ...alignment.PLsmall,
                  ...alignment.PRsmall,
                  marginTop: 10
                }}>
                <View
                  style={[styles(currentTheme).dealContainer, styles().mB10]}>
                  <TextDefault style={styles().totalOrder} H5 bolder>
                    Your Order ({cartLength})
                  </TextDefault>
                  {cart.map((cartItem, index) => {
                    const food = populateFood(cartItem)
                    if (!food) return null
                    return (
                      <View key={cartItem._id} style={[styles(currentTheme).itemContainer]}>
                        <CartItem
                          quantity={food.quantity}
                          dealName={food.title}
                          optionsTitle={food.optionsTitle}
                          itemImage={food.image}
                          itemAddons={food.addons}
                          dealPrice={(
                            parseFloat(food.price) * food.quantity
                          ).toFixed(2)}
                          addQuantity={() => {
                            addQuantity(food.key)
                          }}
                          removeQuantity={() => {
                            removeQuantity(food.key)
                          }}
                        />
                      </View>
                    )
                  })}
                </View>

              </View>
              <View style={styles().suggestedItems}>
                <WouldYouLikeToAddThese itemId={foods[0]._id} restaurantId={restaurant._id} />
              </View>
            </ScrollView>

              <View style={styles().totalBillContainer}>
                <View style={styles(currentTheme).buttonContainer}>
                  <View>
                    <TextDefault
                      textColor={currentTheme.black}
                      style={styles().totalBill}
                      bolder
                      H2>
                      {configuration.currencySymbol}
                      {calculateTotal()}
                    </TextDefault>
                    <TextDefault
                      textColor={currentTheme.black}
                      style={styles().totalBill}
                      bolder
                      Smaller>
                      Total is exclusive of VAT
                    </TextDefault>
                  </View>
                  {isLoggedIn && profile ? (
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => {
                        navigation.navigate('Checkout')
                      }}
                      style={styles(currentTheme).button}>
                      <TextDefault
                        textColor={currentTheme.themeBackground}
                        style={styles().checkoutBtn}
                        bold
                        H5>
                        {t('checkoutBtn')}
                      </TextDefault>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => {
                        props.navigation.navigate({ name: 'CreateAccount' })
                      }}
                      style={styles(currentTheme).button}>
                      <TextDefault
                        textColor={currentTheme.white}
                        style={{ width: '100%' }}
                        H5
                        bolder
                        center>
                        {t('loginOrCreateAccount')}
                      </TextDefault>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
          </>
        )}
      </View>
    </>
  )
}

export default Cart
