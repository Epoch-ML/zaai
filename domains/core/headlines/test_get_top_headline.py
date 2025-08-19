def test_get_top_headline(zerg_state=None):
    """Test retrieving the top headline from Google News."""
    print("Retrieving top headline from Google News")
    
    # Instantiate the connector (adjust instantiation as required)

    from headlines import GoogleHeadlinesConnector
    connector = GoogleHeadlinesConnector()
    headline = connector.get_top_headline()
    assert isinstance(headline, str), "Top headline is not a string"
    assert len(headline) > 0, "No headline retrieved"

    return True